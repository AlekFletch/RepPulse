import { createLogger } from './common/platform/Logger.js';

const logger = createLogger('app');

export default {
    onCreate() {
        logger.info('onCreate');
    },
    onDestroy() {
        logger.info('onDestroy');
    }
};
