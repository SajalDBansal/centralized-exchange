import type { RequestHandler, Request, Response } from "express";

export const createOrder: RequestHandler = async (request: Request, response: Response) => { }
export const cancelOrder: RequestHandler = async (request: Request, response: Response) => { }

export const getAllOrderByMarket: RequestHandler = async (request: Request, response: Response) => { }
export const getAllOpenOrderByMarket: RequestHandler = async (request: Request, response: Response) => { }

