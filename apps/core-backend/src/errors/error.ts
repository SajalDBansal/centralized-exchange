export class ApiError extends Error {
    statusCode: number;
    type: string;

    constructor(statusCode: number, message: string) {
        super(message);

        this.statusCode = statusCode;
        this.type = "API_ERROR";

        Object.setPrototypeOf(this, new.target.prototype);
        Error.captureStackTrace(this, this.constructor);
    }
}

export class AuthenticationError extends ApiError {

    constructor(message: string, code: number, type: string) {
        super(code, message);
        this.type = type;

        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class ValidationError extends ApiError {
    errors: Record<string, string[]>;

    constructor(
        message = 'Validation failed',
        errors: Record<string, string[]> = {}
    ) {
        super(400, message);

        this.name = 'ValidationError';
        this.errors = errors;

        Object.setPrototypeOf(this, new.target.prototype);
    }

    // 🔥 Helper for Zod
    static fromZod(error: any) {
        const fieldErrors = error.flatten().fieldErrors;

        return new ValidationError('Zod Validation failed', fieldErrors);
    }
}