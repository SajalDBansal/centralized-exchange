import type { RequestHandler, Request, Response } from "express";

export const signup: RequestHandler = async (request: Request, response: Response) => { }
export const signin: RequestHandler = async (request: Request, response: Response) => { }
export const signout: RequestHandler = async (request: Request, response: Response) => { }
export const signoutAll: RequestHandler = async (request: Request, response: Response) => { }
export const refresh: RequestHandler = async (request: Request, response: Response) => { }

export const verifyOTP: RequestHandler = async (request: Request, response: Response) => { }
export const resendOTP: RequestHandler = async (request: Request, response: Response) => { }

export const forgotPassword: RequestHandler = async (request: Request, response: Response) => { }
export const resetPassword: RequestHandler = async (request: Request, response: Response) => { }
export const changePassword: RequestHandler = async (request: Request, response: Response) => { }
export const archiveAccount: RequestHandler = async (request: Request, response: Response) => { }