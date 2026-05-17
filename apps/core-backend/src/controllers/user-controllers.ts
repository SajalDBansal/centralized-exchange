import type { RequestHandler, Request, Response } from "express";

export const me: RequestHandler = async (request: Request, response: Response) => { }
export const updateProfile: RequestHandler = async (request: Request, response: Response) => { }

export const getBalance: RequestHandler = async (request: Request, response: Response) => { }
export const addBalance: RequestHandler = async (request: Request, response: Response) => { }
export const withdrawBalance: RequestHandler = async (request: Request, response: Response) => { }