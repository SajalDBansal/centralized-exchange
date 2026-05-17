import type { Request, Response, NextFunction } from 'express';
import { ApiError, ValidationError } from '../errors/error';

export const errorMiddleware = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    let statusCode = 500;
    let message = 'Internal Server Error';
    let type = 'INTERNAL_ERROR';
    let errors = undefined;

    if (err instanceof ApiError) {
        statusCode = err.statusCode;
        message = err.message;

        if (err instanceof ValidationError) {
            type = 'VALIDATION_ERROR';
            errors = err.errors;
        }

        if ('type' in err) {
            type = err.type as string;
        }
    }

    res.status(statusCode).json({
        success: false,
        message,
        type,
        errors,
        ...(process.env.NODE_ENV === 'development' && {
            stack: err.stack,
        }),
    });
};