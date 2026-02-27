export {
  startDiscoveryWorkflow,
  // Database polling (replaces deprecated Restate polling)
  getScanWorkflowStatusDB,
  getScanWorkflowResultsDB,
} from './workflows/discovery-handler';

export { startPortScanWorkflow } from './workflows/port-scan/start';
export {
  cancelPortScanWorkflowExecution,
  getPortScanState,
} from './workflows/port-scan/lifecycle';

export { getActiveDeviceScans } from './workflows/device-scan-handler';
