"use client";

import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { HelpCircle, X, Server, Radar, Bell, Settings } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

// Simple highlight config - no animations
const simpleConfig = {
  animate: false,
  smoothScroll: false,
  allowClose: true,
  overlayClickBehavior: "close" as const,
  stagePadding: 8,
  popoverOffset: 10,
};

// Storage key for cross-page tour continuation
const TOUR_STORAGE_KEY = "onboarding-tour-state";

// Tour: How to add a server
const addServerTour = () => {
  const driverObj = driver({
    ...simpleConfig,
    showProgress: true,
    steps: [
      {
        element: '[data-tour="add-server-btn"]',
        popover: {
          title: "Add Servers",
          description: "Click here to manually add servers by entering hostnames or IP addresses.",
          side: "bottom" as const,
          align: "start" as const,
        },
      },
      {
        element: '[data-tour="start-discovery-btn"]',
        popover: {
          title: "Start Discovery",
          description: "Or use this to automatically discover subdomains for your domain.",
          side: "bottom" as const,
          align: "start" as const,
        },
      },
      {
        popover: {
          title: "Done!",
          description: "Servers will appear in the Discovery tab. Verify them to start monitoring.",
        },
      },
    ],
  });
  driverObj.drive();
};

// Tour: How to run a scan (multi-step with dropdown interaction)
const runScanTour = () => {
  localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify({ tour: "run-scan", step: 1 }));

  const driverObj = driver({
    ...simpleConfig,
    showProgress: true,
    progressText: "1 of 3",
    onDestroyed: () => {
      const stored = localStorage.getItem(TOUR_STORAGE_KEY);
      if (stored) {
        const state = JSON.parse(stored);
        if (state.tour === "run-scan" && state.step === 1) {
          localStorage.removeItem(TOUR_STORAGE_KEY);
        }
      }
    },
    steps: [
      {
        element: '[data-tour="device-card"]',
        popover: {
          title: "Step 1: Server Card",
          description: "Each card shows a server with its status and last scan info.",
          side: "top" as const,
          align: "center" as const,
        },
      },
      {
        element: '[data-tour="card-menu-trigger"]',
        popover: {
          title: "Step 2: Open Menu",
          description: "Click the menu button to see available actions for this server.",
          side: "left" as const,
          align: "start" as const,
        },
        onHighlighted: () => {
          const menuBtn = document.querySelector('[data-tour="card-menu-trigger"]') as HTMLElement;
          if (menuBtn) {
            const handleClick = () => {
              localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify({ tour: "run-scan", step: 2 }));
              driverObj.destroy();
              // Wait for dropdown to open, then continue
              setTimeout(() => continueRunScanTour(), 300);
            };
            menuBtn.addEventListener('click', handleClick, { once: true });
          }
        },
      },
    ],
  });
  driverObj.drive();
};

// Continue run scan tour after dropdown opens
const continueRunScanTour = () => {
  const driverObj = driver({
    ...simpleConfig,
    showProgress: true,
    progressText: "3 of 3",
    onDestroyed: () => {
      localStorage.removeItem(TOUR_STORAGE_KEY);
    },
    steps: [
      {
        element: '[data-tour="scan-btn"]',
        popover: {
          title: "Step 3: Click Scan",
          description: "Click Scan to detect open ports, services, and vulnerabilities on this server.",
          side: "left" as const,
          align: "start" as const,
        },
      },
      {
        popover: {
          title: "Done!",
          description: "The card shows a blue border while scanning. Results appear when complete.",
        },
      },
    ],
  });

  // Wait for scan button to appear in dropdown
  waitForElement('[data-tour="scan-btn"]').then((el) => {
    if (el) {
      driverObj.drive();
    } else {
      // Dropdown didn't open or scan button not found
      localStorage.removeItem(TOUR_STORAGE_KEY);
    }
  });
};

// Tour: How notifications work
const notificationsTour = () => {
  const driverObj = driver({
    ...simpleConfig,
    showProgress: true,
    steps: [
      {
        element: '[data-tour="notifications-btn"]',
        popover: {
          title: "Notifications",
          description: "Security alerts appear here - new ports, CVEs, service changes.",
          side: "bottom" as const,
          align: "end" as const,
        },
      },
      {
        element: '[data-tour="user-menu"]',
        popover: {
          title: "Email Settings",
          description: "Configure which alerts trigger emails in your settings.",
          side: "bottom" as const,
          align: "end" as const,
        },
      },
      {
        popover: {
          title: "Done!",
          description: "HIGH and CRITICAL alerts send emails by default.",
        },
      },
    ],
  });
  driverObj.drive();
};

// Tour: How to set up scan schedules (multi-step with sheet interaction)
const scanScheduleTour = () => {
  localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify({ tour: "scan-schedule", step: 1 }));

  const driverObj = driver({
    ...simpleConfig,
    showProgress: true,
    progressText: "1 of 3",
    onDestroyed: () => {
      const stored = localStorage.getItem(TOUR_STORAGE_KEY);
      if (stored) {
        const state = JSON.parse(stored);
        if (state.step === 1) {
          localStorage.removeItem(TOUR_STORAGE_KEY);
        }
      }
    },
    steps: [
      {
        element: '[data-tour="device-card"]',
        popover: {
          title: "Step 1: Click a Server Card",
          description: "Click on any server card to open its details panel. Go ahead, click the card!",
          side: "top" as const,
          align: "center" as const,
        },
        onHighlighted: () => {
          const card = document.querySelector('[data-tour="device-card"]') as HTMLElement;
          if (card) {
            const handleClick = () => {
              localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify({ tour: "scan-schedule", step: 2 }));
              driverObj.destroy();
              setTimeout(() => continueSheetTour(), 400);
            };
            card.addEventListener('click', handleClick, { once: true });
          }
        },
      },
    ],
  });
  driverObj.drive();
};

// Continue tour inside the sheet
const continueSheetTour = () => {
  const driverObj = driver({
    ...simpleConfig,
    showProgress: true,
    progressText: "2 of 3",
    onDestroyed: () => {
      const stored = localStorage.getItem(TOUR_STORAGE_KEY);
      if (stored) {
        const state = JSON.parse(stored);
        if (state.step === 2) {
          localStorage.removeItem(TOUR_STORAGE_KEY);
        }
      }
    },
    steps: [
      {
        element: '[data-tour="view-details-btn"]',
        popover: {
          title: "Step 2: Click View Full Details",
          description: "Click this button to go to the device page where you can configure scan schedules.",
          side: "top" as const,
          align: "center" as const,
        },
        onHighlighted: () => {
          const btn = document.querySelector('[data-tour="view-details-btn"]') as HTMLElement;
          if (btn) {
            const handleClick = () => {
              localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify({ tour: "scan-schedule", step: 3 }));
              driverObj.destroy();
            };
            btn.addEventListener('click', handleClick, { once: true });
          }
        },
      },
    ],
  });

  setTimeout(() => {
    if (document.querySelector('[data-tour="view-details-btn"]')) {
      driverObj.drive();
    }
  }, 100);
};

// Wait for element to appear in DOM using MutationObserver (no polling)
const waitForElement = (selector: string, maxWait = 5000): Promise<Element | null> => {
  return new Promise((resolve) => {
    // Already exists?
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    // Watch for DOM changes
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        clearTimeout(timeout);
        resolve(el);
      }
    });

    // Safety timeout
    const timeout = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, maxWait);

    observer.observe(document.body, { childList: true, subtree: true });
  });
};

// Continue tour on device detail page
export const continueScanScheduleTour = async () => {
  if (typeof window === "undefined") return false;

  const stored = localStorage.getItem(TOUR_STORAGE_KEY);
  if (!stored) return false;

  try {
    const state = JSON.parse(stored);
    if (state.tour === "scan-schedule" && state.step === 3) {
      localStorage.removeItem(TOUR_STORAGE_KEY);

      // Wait for the element to actually exist
      const element = await waitForElement('[data-tour="scan-schedule"]');
      if (!element) {
        console.warn("Tour element not found, skipping tour");
        return false;
      }

      const driverObj = driver({
        ...simpleConfig,
        showProgress: true,
        progressText: "Step 3 of 3",
        steps: [
          {
            element: '[data-tour="scan-schedule"]',
            popover: {
              title: "Step 3: Scan Schedule",
              description: "Here you can configure how often this server is scanned.",
              side: "left" as const,
              align: "start" as const,
            },
          },
          {
            popover: {
              title: "All Done!",
              description: "Verified servers are automatically scanned based on their schedule.",
            },
          },
        ],
      });
      driverObj.drive();

      return true;
    }
  } catch {
    localStorage.removeItem(TOUR_STORAGE_KEY);
  }
  return false;
};

// Tour configs with required paths
const TOURS = {
  addServer: { path: "/servers", needsDevices: false, fn: addServerTour },
  runScan: { path: "/servers", needsDevices: true, fn: runScanTour },
  notifications: { path: null, needsDevices: false, fn: notificationsTour }, // Works anywhere
  scanSchedule: { path: "/servers", needsDevices: true, fn: scanScheduleTour },
} as const;

// Guide user to click Servers in menu, then continue with actual tour
const startGuidedTour = (tourKey: keyof typeof TOURS) => {
  // Store which tour to continue after navigation
  localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify({ pendingTour: tourKey }));

  const driverObj = driver({
    ...simpleConfig,
    showProgress: true,
    progressText: "Step 1",
    steps: [
      {
        element: '[data-tour="nav-servers"]',
        popover: {
          title: "First, go to Servers",
          description: "Click here to open the Servers page where you can manage your servers.",
          side: "right" as const,
          align: "center" as const,
        },
        onHighlighted: () => {
          const navBtn = document.querySelector('[data-tour="nav-servers"]') as HTMLElement;
          if (navBtn) {
            navBtn.addEventListener('click', () => {
              driverObj.destroy();
              // Tour will continue via useEffect after navigation
            }, { once: true });
          }
        },
      },
    ],
  });
  driverObj.drive();
};

// Component - only renders on client
export function OnboardingGuide() {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Check for pending tour after navigation
  useEffect(() => {
    if (!mounted) return;

    const stored = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!stored) return;

    try {
      const state = JSON.parse(stored);
      if (state.pendingTour && state.pendingTour in TOURS) {
        const tour = TOURS[state.pendingTour as keyof typeof TOURS];
        const currentPath = window.location.pathname;

        // Only continue if we're now on the right page
        if (tour.path && currentPath.includes(tour.path)) {
          localStorage.removeItem(TOUR_STORAGE_KEY);

          // Wait for page to render, then start actual tour
          const selector = tour.needsDevices ? '[data-tour="device-card"]' : '[data-tour="add-server-btn"]';
          waitForElement(selector).then((el) => {
            if (el || !tour.needsDevices) {
              tour.fn();
            } else if (tour.needsDevices) {
              alert("This tour requires at least one server. Add a server first!");
            }
          });
        }
      }
    } catch {
      localStorage.removeItem(TOUR_STORAGE_KEY);
    }
  }, [mounted]);

  if (!mounted) return null;

  const startTour = (tourKey: keyof typeof TOURS) => {
    setIsOpen(false);
    const tour = TOURS[tourKey];
    const currentPath = window.location.pathname;

    // If not on required page, guide user to click Servers first
    if (tour.path && !currentPath.includes(tour.path)) {
      startGuidedTour(tourKey);
      return;
    }

    // Check if tour needs devices
    if (tour.needsDevices && !document.querySelector('[data-tour="device-card"]')) {
      alert("This tour requires at least one server. Add a server first!");
      return;
    }

    tour.fn();
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isOpen && (
        <div className="mb-2 bg-card border rounded-lg shadow-lg p-4 w-64">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Quick Guides</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-left"
              onClick={() => startTour("addServer")}
            >
              <Server className="w-4 h-4" />
              How to add a server?
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-left"
              onClick={() => startTour("runScan")}
            >
              <Radar className="w-4 h-4" />
              How to run a scan?
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-left"
              onClick={() => startTour("notifications")}
            >
              <Bell className="w-4 h-4" />
              How do notifications work?
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-left"
              onClick={() => startTour("scanSchedule")}
            >
              <Settings className="w-4 h-4" />
              How to set scan schedule?
            </Button>
          </div>
        </div>
      )}

      <Button
        onClick={() => setIsOpen(!isOpen)}
        size="icon"
        className="rounded-full w-12 h-12 shadow-lg"
        variant={isOpen ? "secondary" : "default"}
      >
        {isOpen ? <X className="w-5 h-5" /> : <HelpCircle className="w-5 h-5" />}
      </Button>
    </div>
  );
}
