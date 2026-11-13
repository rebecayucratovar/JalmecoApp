import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { Api } from '@/lib/api'
import { AlmacenObservable, ProveedorSesion } from '@/lib/sesion'

import { LoginPagina } from './LoginPagina'

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

function montar(f: typeof fetch) {
  const almacen = new AlmacenObservable(null)
  const api = new Api(almacen, { fetch: f })
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPagina /> },
      { path: '/mapa', element: <p>Pantalla del mapa</p> },
    ],
    { initialEntries: [{ pathname: '/login', state: { desde: '/mapa' } }] },
  )
  render(
    <ProveedorSesion almacen={almacen} api={api}>
      <RouterProvider router={router} />
    </ProveedorSesion>,
  )
  return almacen
}

describe('LoginPagina', () => {
  it('con credenciales correctas entra y vuelve a donde iba', async () => {
    const f = vi.fn(async () =>
      json({ access: 'a', refresh: 'r', admin: { id: 1, nombre: 'Carla', email: 'c@j.com' } }),
    )
    const almacen = montar(f)
    await userEvent.type(screen.getByLabelText('Correo'), 'c@j.com')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreta')
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(await screen.findByText('Pantalla del mapa')).toBeInTheDocument()
    expect(almacen.leer()?.admin.nombre).toBe('Carla')
  })

  it('con credenciales incorrectas muestra el error', async () => {
    montar(vi.fn(async () => json({ error: 'Credenciales inválidas.', codigo: 'CREDENCIALES_INVALIDAS' }, 401)))
    await userEvent.type(screen.getByLabelText('Correo'), 'c@j.com')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala')
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(await screen.findByText('Correo o contraseña incorrectos.')).toBeInTheDocument()
  })

  it('pide completar los campos sin llamar al servidor', async () => {
    const f = vi.fn()
    montar(f)
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(screen.getByText('Escribe tu correo y tu contraseña.')).toBeInTheDocument()
    expect(f).not.toHaveBeenCalled()
  })

  it('el ojo muestra y oculta la contraseña', async () => {
    montar(vi.fn())
    const campo = screen.getByLabelText('Contraseña')
    expect(campo).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }))
    expect(campo).toHaveAttribute('type', 'text')
  })
})
