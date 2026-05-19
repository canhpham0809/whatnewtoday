// Custom Premium Console Logger with ANSI Colors

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  underscore: "\x1b[4m",
  blink: "\x1b[5m",
  reverse: "\x1b[7m",
  hidden: "\x1b[8m",
  
  fg: {
    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    crimson: "\x1b[38m"
  },
  bg: {
    black: "\x1b[40m",
    red: "\x1b[41m",
    green: "\x1b[42m",
    yellow: "\x1b[43m",
    blue: "\x1b[44m",
    magenta: "\x1b[45m",
    cyan: "\x1b[46m",
    white: "\x1b[47m",
    crimson: "\x1b[48m"
  }
};

function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace("T", " ").substring(0, 19);
}

export const logger = {
  info: (message: string, context = "SYSTEM") => {
    console.log(
      `[${getTimestamp()}] ${colors.fg.blue}[INFO]${colors.reset} [${context}] ${message}`
    );
  },
  
  success: (message: string, context = "SYSTEM") => {
    console.log(
      `[${getTimestamp()}] ${colors.fg.green}[SUCCESS]${colors.reset} [${context}] ${colors.bright}${message}${colors.reset}`
    );
  },
  
  warn: (message: string, context = "SYSTEM") => {
    console.warn(
      `[${getTimestamp()}] ${colors.fg.yellow}[WARN]${colors.reset} [${context}] ${message}`
    );
  },
  
  error: (message: string, error?: any, context = "SYSTEM") => {
    console.error(
      `[${getTimestamp()}] ${colors.fg.red}[ERROR]${colors.reset} [${context}] ${message}`
    );
    if (error) {
      if (error.stack) {
        console.error(`${colors.fg.red}${error.stack}${colors.reset}`);
      } else {
        console.error(error);
      }
    }
  },
  
  debug: (message: string, context = "SYSTEM") => {
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[${getTimestamp()}] ${colors.fg.magenta}[DEBUG]${colors.reset} [${context}] ${colors.dim}${message}${colors.reset}`
      );
    }
  }
};
