import { clsx, type ClassValue } from "clsx";
import { Socket } from "socket.io-client";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function emitAsync<T>(socket: Socket, event: string, data: any): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("No response within 5 seconds"));
    }, 5000);

    socket.emit(event, data, (response: any) => {
      clearTimeout(timeout);
      if (response?.success) {
        resolve(response.data);
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
    return [new Error(error || "Unknown error"), null]; // Error occurred
  }
}
