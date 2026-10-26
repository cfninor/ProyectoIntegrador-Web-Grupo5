/**
 * Lo que el portal usa de Amplify v6 (D4 de la SOLVENTAG5-207). `SesionCognito` carga este módulo
 * con `import()` solo cuando `config.json` trae `cognito`, así Amplify queda fuera del bundle
 * inicial y el ambiente local no lo descarga.
 */
import { Amplify } from 'aws-amplify';
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';
import { sessionStorage } from 'aws-amplify/utils';

import { ConfigCognito } from '../config/app-config';

export {
  confirmSignUp,
  fetchAuthSession,
  resendSignUpCode,
  signIn,
  signOut,
  signUp,
} from 'aws-amplify/auth';

/**
 * Configura el user pool del ambiente. Los tokens van en `sessionStorage` (R10): nada de la sesión
 * queda en `localStorage` y cada pestaña tiene la suya.
 */
export function configurar(cognito: ConfigCognito): void {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: cognito.userPoolId,
        userPoolClientId: cognito.clienteId,
        loginWith: { email: true },
      },
    },
  });
  cognitoUserPoolsTokenProvider.setKeyValueStorage(sessionStorage);
}
