/**
 * Prescan logic for port scan workflows
 *
 * This module handles prescan policy decisions and configuration
 * for Masscan and RustScan tools in the scanning pipeline.
 */

export {
  resolveMode,
  shouldRunPrescan,
  createMasscanConfig,
  createRustscanConfig,
  gatherHintPorts,
  type PortScanConfig,
} from './policy';
