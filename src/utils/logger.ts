import winston, {Logger, format} from 'winston';
require('dotenv').config();

export const logger:Logger = winston.createLogger({
    level: process.env.LOG_LEVEL?process.env.LOG_LEVEL:'info',
    format: format.combine(
        format.timestamp(),
        format.json(),
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
});

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple(),
    }));
}
