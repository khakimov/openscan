export {
  startDiscoveryWorkflow,
  // Database polling (replaces deprecated Restate polling)
  getScanWorkflowStatusDB,
  getScanWorkflowResultsDB,
} from './workflows/discovery-handler';

export {
  startPortScanWorkflow,
  cancelPortScanWorkflowExecution,
  getPortScanState,
} from './workflows/port-scan';

export { getActiveDeviceScans } from './workflows/device-scan-handler';
