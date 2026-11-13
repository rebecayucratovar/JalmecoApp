import { describe, expect, it, vi } from 'vitest'

import { Api, ApiError, type AlmacenSesion, type DatosSesion } from './api'

const admin = { id: 1, nombre: 'Carla Rojas', email: 'carla@jalmeco.com' }

function memoria(inicial: DatosSesion | null = null): AlmacenSesion & { datos: DatosSesion | null } {
  return {
    datos: inicial,
    leer() {
      return this.datos
    },
    guardar(s) {
      this.datos = s
    },
  }
}

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

describe('Api', () => {
  it('login guarda la sesión', async () => {
    const almacen = memoria()
    const f = vi.fn(async () => json({ access: 'a1', refresh: 'r1', admin }))
    await new Api(almacen, { fetch: f }).login(' carla@jalmeco.com ', 'clave')
    expect(almacen.datos?.admin.nombre).toBe('Carla Rojas')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v1/auth/admin/login')
    expect(JSON.parse(init.body as string)).toEqual({ email: 'carla@jalmeco.com', password: 'clave' })
  })

  it('envía el token y, si venció, lo renueva una sola vez y repite', async () => {
    const almacen = memoria({ access: 'viejo', refresh: 'r1', admin })
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('auth/refresh')) return json({ access: 'nuevo' })
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization
      return auth === 'Bearer nuevo' ? json({ ok: true }) : json({ error: 'Token vencido' }, 401)
    })
    const api = new Api(almacen, { fetch: f as unknown as typeof fetch })
    // Dos pedidos a la vez: una sola renovación
    const [a, b] = await Promise.all([api.get('mapa-en-vivo'), api.get('mapa-en-vivo')])
    expect(a).toEqual({ ok: true })
    expect(b).toEqual({ ok: true })
    expect(almacen.datos?.access).toBe('nuevo')
    expect(f.mock.calls.filter(([u]) => String(u).endsWith('auth/refresh'))).toHaveLength(1)
  })

  it('si no se puede renovar, cierra la sesión', async () => {
    const almacen = memoria({ access: 'viejo', refresh: 'vencido', admin })
    const f = vi.fn(async () => json({ error: 'Token inválido' }, 401))
    await expect(new Api(almacen, { fetch: f }).get('mapa-en-vivo')).rejects.toMatchObject({
      codigo: 'SESION_EXPIRADA',
    })
    expect(almacen.datos).toBeNull()
  })

  it('traduce errores del servidor, de red y del negocio', async () => {
    const almacen = memoria({ access: 'a', refresh: 'r', admin })
    const caido = new Api(almacen, { fetch: async () => new Response('<html>', { status: 502 }) })
    await expect(caido.get('x')).rejects.toThrow('Error del servidor (502)')

    const sinRed = new Api(almacen, { fetch: async () => Promise.reject(new TypeError('Failed to fetch')) })
    const error = await sinRed.get('x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).sinConexion).toBe(true)

    const negocio = new Api(almacen, {
      fetch: async () => json({ error: 'Ya respondida.', codigo: 'YA_RESPONDIDA' }, 409),
    })
    await expect(negocio.post('x')).rejects.toMatchObject({
      message: 'Ya respondida.',
      codigo: 'YA_RESPONDIDA',
      status: 409,
    })
  })
})
