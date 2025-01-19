import { clsx, type ClassValue } from "clsx";
import { Socket } from "socket.io-client";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function emitAsync<T>(socket: Socket, event: string, data: any): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.emit(event, data, (response: any) => {
      if (response?.success) {
        resolve(response);
      } else {
        reject(new Error(response?.message || "Unknown error"));
      }
    });
  });
}

export async function safeEmitAsync<T>(socket: Socket, event: string, data: any): Promise<[Error | null, T | null]> {
  try {
    const result = await emitAsync<T>(socket, event, data);
    return [null, result]; // No error, result is valid
  } catch (error: any) {
    return [new Error(error.message || "Unknown error"), null]; // Error occurred
  }
}
