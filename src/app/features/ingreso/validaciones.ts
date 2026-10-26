import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Reglas de formato de los datos básicos (R12 de la SOLVENTAG5-207): las mismas de
 * `solventa_common/identidad/datos_basicos.py` y de `RegistroCuentaCliente` del contrato del BFF
 * web, para que el portal no envíe lo que el BFF va a rechazar. El número del documento según su
 * tipo es `PATRON_DOCUMENTO` de la cotización, que ya sigue esa regla.
 */
const LETRAS = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';
export const PATRON_NOMBRE = new RegExp(`^[${LETRAS}]+([ '\\-][${LETRAS}]+)*$`);
export const LARGO_NOMBRE = { minimo: 2, maximo: 60 };
export const PATRON_CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
export const PATRON_CELULAR = /^3\d{9}$/;
export const PATRON_CODIGO = /^\d{6}$/;

/** Política de contraseñas del user pool (parte 2): 12 caracteres, mayúsculas, minúsculas y números. */
export function cumplePolitica(contrasena: string): boolean {
  return (
    contrasena.length >= 12 &&
    /[A-Z]/.test(contrasena) &&
    /[a-z]/.test(contrasena) &&
    /\d/.test(contrasena)
  );
}

/** Obligatorio: un texto con solo espacios cuenta como vacío. */
export function requerido(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim() ? null : { requerido: true };
}

/** El texto sin espacios al inicio y al final cumple el patrón; vacío lo valida `requerido`. */
export function patron(expresion: RegExp): ValidatorFn {
  return (control: AbstractControl<string>) => {
    const texto = control.value.trim();
    return !texto || expresion.test(texto) ? null : { formato: true };
  };
}

export function largo(rango: { minimo: number; maximo: number }): ValidatorFn {
  return (control: AbstractControl<string>) => {
    const texto = control.value.trim();
    return texto && (texto.length < rango.minimo || texto.length > rango.maximo)
      ? { largo: true }
      : null;
  };
}

/** La clave del primer error del control, cuando ya se tocó. */
export function errorVisible(control: AbstractControl): string | null {
  return control.errors && control.touched ? Object.keys(control.errors)[0] : null;
}
