import { useState } from 'react';
import { toast } from 'sonner';
import {
  useStartDiscoveryMutation,
  useDiscoveryWorkflowStatus,
  useDiscoveryWorkflowResults,
} from '@/queries/discovery-queries';
import { useCreateDevicesFromDiscoveryWithToast } from '@/queries/device-queries';
import type { DiscoveryResultItem } from '@/components/discovery/discovery-results-table';

export interface UseDiscoveryWorkflowProps {
  /**
   * Project ID for device creation
   */
  projectId: string;

  /**
   * Initial scan ID (if resuming an existing discovery)
   */
  initialScanId?: string;

  /**
   * Initial target domain (if pre-filled)
   */
  initialTarget?: string;

  /**
   * Callback when discovery starts successfully
   */
  onDiscoveryStarted?: (target: string) => void;

  /**
   * Callback when devices are created successfully
   */
  onDevicesAdded?: (deviceIds: string[]) => void;

  /**
   * Options for device creation
   */
  deviceOptions?: {
    source?: string;
    scope?: 'INTERNAL' | 'EXTERNAL' | 'HYBRID';
    verificationStatus?: 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED';
  };
}

/**
 * Shared discovery workflow hook
 *
 * Encapsulates common logic for:
 * - Domain validation and submission
 * - Workflow status polling (database-first, not Restate)
 * - Results fetching and normalization
 * - Device creation from selected results
 *
 * Used by:
 * - AddDiscovery modal (dashboard)
 * - Onboarding discovery route (setup flow)
 */
export function useDiscoveryWorkflow({
  projectId,
  initialScanId,
  initialTarget,
  onDiscoveryStarted,
  onDevicesAdded,
  deviceOptions,
}: UseDiscoveryWorkflowProps) {
  // State management
  const [target, setTarget] = useState(initialTarget || '');
  const [error, setError] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(initialScanId || null);
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set());

  // Mutations
  const startDiscoveryMutation = useStartDiscoveryMutation();
  const addDevicesMutation = useCreateDevicesFromDiscoveryWithToast();

  // Database polling for workflow status via tRPC (postback updates database)
  // Always call hook, push condition into enabled (Rules of Hooks)
  const workflowStatusQuery = useDiscoveryWorkflowStatus(scanId || '', {
    enabled: !!scanId,
  });

  // Automatically fetch results from database when workflow completes
  const workflowResultsQuery = useDiscoveryWorkflowResults(scanId || '', {
    enabled: !!scanId && workflowStatusQuery.data?.isCompleted === true,
  });

  // Derive UI state from React Query data
  const workflowStatus = workflowStatusQuery.data;
  const workflowResults = workflowResultsQuery.data;
  const isFetchingResults = workflowResultsQuery.isFetching;

  const isRunning = workflowStatus?.isRunning === true;
  const isCompleted = workflowStatus?.isCompleted === true;
  const isFailed = workflowStatus?.isFailed === true;
  const results = workflowResults?.success ? workflowResults.result : null;

  // Derived state: Show as running if we have a scanId but it's not completed/failed yet
  // This bridges the gap between mutation completing and polling picking up status
  // Also show as running while fetching results (eliminates lag between completion and table render)
  const showAsRunning = isRunning || (scanId !== null && !isCompleted && !isFailed) || isFetchingResults;

  // Get discovery items (either from results array or uniqueSubdomains), filter out items without IP
  const discoveryItems: DiscoveryResultItem[] = results
    ? (results.results?.[0]?.results?.filter((r: any) => r.ip).map((r: any) => ({
          host: r.host,
          ip: r.ip,
        })) ||
        results.uniqueSubdomains?.filter((s: any) => s.ip).map((s: any) => ({
          host: s.subdomain,
          ip: s.ip,
        })) ||
        [])
    : [];

  /**
   * Domain validation
   * Returns error message or null if valid
   */
  const validateTarget = (value: string): string | null => {
    const trimmedTarget = value.trim().toLowerCase();

    // Basic validation
    if (!trimmedTarget) {
      return 'Please enter a domain name';
    }

    // Domain validation regex - only allows valid domain characters
    const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

    if (!domainRegex.test(trimmedTarget)) {
      return 'Please enter a valid domain name (e.g., example.com)';
    }

    // Check for localhost and internal domains
    const blockedDomains = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      'local',
      'internal',
      '.local',
      '.internal',
      '.localdomain',
      '.localhost'
    ];

    if (blockedDomains.some(blocked =>
      trimmedTarget === blocked ||
      trimmedTarget.endsWith(blocked) ||
      trimmedTarget.includes('localhost') ||
      trimmedTarget.includes('127.0.0.1')
    )) {
      return 'Cannot scan internal or localhost domains';
    }

    // Check for common command injection patterns
    const dangerousPatterns = [
      /[;&|`$(){}[\]<>\\]/,  // Shell metacharacters
      /\.\./,                 // Directory traversal
      /^-/,                   // Command flags
    ];

    if (dangerousPatterns.some(pattern => pattern.test(trimmedTarget))) {
      return 'Invalid characters detected in domain name';
    }

    // Additional length check
    if (trimmedTarget.length > 253) {  // Max domain length per RFC
      return 'Domain name is too long';
    }

    return null;
  };

  /**
   * Start discovery workflow
   */
  const handleStartDiscovery = () => {
    const trimmedTarget = target.trim().toLowerCase();
    const validationError = validateTarget(trimmedTarget);

    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSelectedResults(new Set());

    startDiscoveryMutation.mutate(
      { target: trimmedTarget },
      {
        onSuccess: (result) => {
          if (result.success) {
            setError(null);
            setScanId(result.scanId); // This triggers showAsRunning immediately
            toast.success(`Discovery started for ${trimmedTarget}`, {
              description: 'You will be notified when results are ready',
            });
            onDiscoveryStarted?.(trimmedTarget);
          } else {
            setError(result.error || 'Failed to start discovery');
          }
        },
        onError: (err: any) => {
          const errorMessage = err instanceof Error ? err.message : 'Failed to start discovery';
          setError(errorMessage);
        },
      }
    );
  };

  /**
   * Add selected results as devices
   * 
   * Shows a loading toast immediately, closes modal, then updates toast when complete.
   * This provides better UX for bulk operations by not blocking the UI.
   */
  const handleAddDevices = () => {
    const selectedTargets = Array.from(selectedResults);

    if (selectedTargets.length === 0) {
      toast.error('Please select at least one target');
      return;
    }

    // Extract hostname and IP data from normalized discovery items
    const targetsData = selectedTargets.map(host => {
      const item = discoveryItems.find((item) => item.host === host);
      return {
        host,
        ip: item?.ip === 'Not resolved' ? undefined : item?.ip,
      };
    });

    // Show loading toast immediately
    const toastId = toast.loading(
      `Adding ${selectedTargets.length} ${selectedTargets.length === 1 ? 'device' : 'devices'} to inventory...`
    );

    // Start the mutation with toastId for tracking
    // The modal can close immediately while this runs in background
    addDevicesMutation.mutate(
      {
        targets: targetsData,
        projectId,
        toastId,
        options: deviceOptions,
      },
      {
        onSuccess: (response) => {
          const devices = response.devices ?? [];

          // Notify parent of newly added device IDs (for animation/cache updates)
          if (onDevicesAdded && devices.length > 0) {
            const deviceIds = devices.map((d: any) => d.id);
            onDevicesAdded(deviceIds);
          }
        },
        // Error handling is done by the mutation itself (updates toast)
      }
    );
  };

  return {
    // State
    target,
    setTarget,
    error,
    setError,
    scanId,
    selectedResults,
    setSelectedResults,

    // Derived state
    isRunning,
    isCompleted,
    isFailed,
    showAsRunning,
    discoveryItems,
    results,
    workflowStatus,

    // Mutation states
    isStarting: startDiscoveryMutation.isPending,
    isAddingDevices: addDevicesMutation.isPending,

    // Actions
    handleStartDiscovery,
    handleAddDevices,
    validateTarget,
  };
}
