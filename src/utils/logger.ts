export class Logger {
    static log(message: string) {
        console.log(`[INFO] ${new Date().toISOString()} - ${message}`);
    }

    static error(message: string, error?: any) {
        console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error || '');
    }

    static warn(message: string) {
        console.warn(`[WARN] ${new Date().toISOString()} - ${message}`);
    }
}
