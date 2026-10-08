import { render, screen } from '@testing-library/angular';

import { App } from './app';

describe('App', () => {
  it('muestra la marca y el propósito del portal', async () => {
    await render(App);

    expect(screen.getByText('Solventa')).toBeInTheDocument();
    expect(screen.getByText('Portal de clientes, asesores y socios')).toBeInTheDocument();
  });
});
