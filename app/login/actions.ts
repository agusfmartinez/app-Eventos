"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/lib/auth";

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  try {
    await signIn("credentials", {
      username: formData.get("username"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (error) {
    // signIn lanza un redirect en el caso exitoso: ese error TIENE que
    // propagarse o el login nunca navega.
    if (error instanceof AuthError) {
      // Mensaje único a propósito: no revelamos si el usuario existe.
      return { error: "Usuario o contraseña incorrectos." };
    }
    throw error;
  }

  return {};
}
