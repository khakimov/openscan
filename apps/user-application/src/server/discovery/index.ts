export {
  startDiscoveryWorkflow,
  getWorkflowStatus,
  getWorkflowResult,
  // Database polling (preferred - used by UI)
  getScanWorkflowStatusDB,
  getScanWorkflowResultsDB,
} from './workflows/discovery-handler';

export {
  startPortScanWorkflow,
  cancelPortScanWorkflowExecution,
  getPortScanState,
} from './workflows/port-scan';

export { getActiveDeviceScans } from './workflows/device-scan-handler';
