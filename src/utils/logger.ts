import winston from 'winston';
import path from 'path';
import fs from 'fs';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_DIR = process.env.LOG_DIR || './logs';
const LOG_FILE = process.env.LOG_FILE || 'bot.log';

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = JSON.stringify(meta, null, 2);
    }
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

const transports: winston.transport[] = [
  // Always add console transport so logs are visible in Render/production
  new winston.transports.Console({
    format: consoleFormat,
  }),
];

// Only add file transports if we can write to the filesystem
// (may not be available in some cloud environments)
try {
  transports.push(
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    })
  );
  transports.push(
    new winston.transports.File({
      filename: path.join(LOG_DIR, LOG_FILE),
      maxsize: 20 * 1024 * 1024,
      maxFiles: 10,
    })
  );
} catch (error) {
  // If file logging fails, just use console
  console.warn('File logging disabled (no write access)');
}

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: logFormat,
  transports,
});

export class Logger {
  private context?: string;

  constructor(context?: string) {
    this.context = context;
  }

  private formatMessage(message: string): string {
    return this.context ? `[${this.context}] ${message}` : message;
  }

  error(message: string, meta?: object): void {
    logger.error(this.formatMessage(message), meta);
  }

  warn(message: string, meta?: object): void {
    logger.warn(this.formatMessage(message), meta);
  }

  info(message: string, meta?: object): void {
    logger.info(this.formatMessage(message), meta);
  }

  debug(message: string, meta?: object): void {
    logger.debug(this.formatMessage(message), meta);
  }
}

export const createLogger = (context: string): Logger => {
  return new Logger(context);
};

export default logger;
