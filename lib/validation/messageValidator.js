const { hasProcessedMessage } = require('../cache/cacheHandler');
const logger = require('../logging/logger');


const currentServiceName = `${process.env.SERVICE_NAME}-${process.env.SERVICE_VERSION}`;

const validateMessage = async (message, interestedSaga, requiredContextProps = [], requiredDecorationsProps = [], rollbackHandler, listener) => {

    logger.info('Starting message validation', { correlationId: message.correlationId, saga: message.saga, interestedSaga });

    try{
        if (message.saga !== interestedSaga) {
            logger.warn(`${listener} is not interested in this saga`, { correlationId: message.correlationId, saga: message.saga });
            return { isValid: false, reason: `${listener} is not interested in this ${message.saga}` };
        }

        if (message.lastServiceDecoration === currentServiceName) {
            logger.warn('This message was last decorated by this service', { correlationId: message.correlationId, saga: message.saga });
            return { isValid: false, reason: 'Message last decorated by this service' };
        }

        const errorDecoration = message.decorations.find(decoration => decoration.error);
        if (errorDecoration) {
            logger.warn('Error present in message', { correlationId: message.correlationId, saga: message.saga, error: errorDecoration.error });
            const alreadyProcessed = await hasProcessedMessage(message.correlationId);

            if (alreadyProcessed) {
                logger.warn('This errored message has already been processed, triggering rollback', { correlationId: message.correlationId, saga: message.saga });
                const isRolledBack = await rollbackHandler(message);
                return { isValid: !isRolledBack, reason: isRolledBack ? 'Rolled back' : 'Error present but already processed' };
            } else {
                logger.info('Rejecting message due to error presence', { correlationId: message.correlationId, saga: message.saga, error: errorDecoration.error });
            return { isValid: false, reason: `Error present: ${errorDecoration.error}` };
            }
        }

        if (message.decorations.some(decoration => decoration.service === currentServiceName)) {
            logger.warn('This message was already decorated by this service', { correlationId: message.correlationId, saga: message.saga });
            return { isValid: false, reason: 'Already decorated' };
        }

        for (const prop of requiredContextProps) {
            if (message.context[prop] === undefined) {
                logger.warn('Message has missing required context property', { correlationId: message.correlationId, saga: message.saga, prop });
                return { isValid: false, reason: `Missing required context property: ${prop}` };
            }
        }

        for (const prop of requiredDecorationsProps) {
            const decorationExists = message.decorations.some(decoration => decoration[prop] !== undefined);
            if (!decorationExists) {
                logger.warn('Messge has missing required decoration property', { correlationId: message.correlationId, saga: message.saga, prop });
                return { isValid: false, reason: `Missing required decoration property: ${prop}` };
            }
        }
    
        logger.info('Message validation successful', { correlationId: message.correlationId, saga: message.saga });
        return { isValid: true };
    
    } catch (error) {
        logger.error('Error in message validation', { correlationId: message.correlationId, saga: message.saga, error });

        throw error; 
    } 
};

module.exports = { validateMessage };