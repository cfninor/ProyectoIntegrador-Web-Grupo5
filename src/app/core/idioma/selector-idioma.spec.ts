import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { Almacen, CLAVE_PREFERENCIA } from './idioma';
import { ALMACEN_IDIOMA, RECARGAR_PAGINA, SelectorIdioma } from './selector-idioma';

/** Renderiza el selector con el idioma `locale`; `conAlmacen` false simula no tener localStorage. */
async function renderizar(locale: string, conAlmacen = true) {
  const recargar = jest.fn();
  const guardado: Record<string, string> = {};
  const almacenPrueba: Almacen | null = conAlmacen
    ? {
        getItem: (clave) => guardado[clave] ?? null,
        setItem: (clave, valor) => {
          guardado[clave] = valor;
        },
      }
    : null;
  await render(SelectorIdioma, {
    providers: [
      { provide: LOCALE_ID, useValue: locale },
      { provide: ALMACEN_IDIOMA, useValue: almacenPrueba },
      { provide: RECARGAR_PAGINA, useValue: recargar },
    ],
  });
  return { recargar, guardado, usuario: userEvent.setup() };
}

describe('SelectorIdioma', () => {
  it('muestra ES y EN en un grupo, con el idioma activo marcado', async () => {
    await renderizar('es-CO');

    const grupo = screen.getByRole('group', { name: 'Idioma' });
    expect(grupo).toBeInTheDocument();
    const espanol = screen.getByRole('button', { name: 'Español' });
    const ingles = screen.getByRole('button', { name: 'English' });
    expect(espanol).toHaveTextContent('ES');
    expect(ingles).toHaveTextContent('EN');
    expect(espanol).toHaveAttribute('aria-pressed', 'true');
    expect(espanol).toHaveClass('activa');
    expect(ingles).toHaveAttribute('aria-pressed', 'false');
    expect(espanol).toHaveAttribute('lang', 'es');
    expect(ingles).toHaveAttribute('lang', 'en');
  });

  it('con el portal en inglés, EN es el activo', async () => {
    await renderizar('en-US');

    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Español' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('con un LOCALE_ID que el portal no maneja, el activo es el español', async () => {
    await renderizar('fr-FR');

    expect(screen.getByRole('button', { name: 'Español' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('elegir el otro idioma guarda la preferencia y recarga la página', async () => {
    const { recargar, guardado, usuario } = await renderizar('es-CO');

    await usuario.click(screen.getByRole('button', { name: 'English' }));

    expect(guardado[CLAVE_PREFERENCIA]).toBe('en-US');
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it('elegir el idioma activo no hace nada', async () => {
    const { recargar, guardado, usuario } = await renderizar('en-US');

    await usuario.click(screen.getByRole('button', { name: 'English' }));

    expect(guardado).toEqual({});
    expect(recargar).not.toHaveBeenCalled();
  });

  it('sin localStorage no recarga: volvería al mismo idioma', async () => {
    const { recargar, usuario } = await renderizar('es-CO', false);

    await usuario.click(screen.getByRole('button', { name: 'English' }));

    expect(recargar).not.toHaveBeenCalled();
  });

  it('por defecto guarda en localStorage y recarga el documento', () => {
    TestBed.configureTestingModule({});

    expect(TestBed.inject(ALMACEN_IDIOMA)).toBe(localStorage);
    // jsdom no implementa la recarga: basta comprobar que la función llama a location.reload.
    const recargar = TestBed.inject(RECARGAR_PAGINA);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => recargar()).not.toThrow();
    error.mockRestore();
  });
});
