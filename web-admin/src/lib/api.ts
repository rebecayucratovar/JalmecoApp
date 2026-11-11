/**
 * Cliente de la API de Jalmeco GPS (ver docs/contrato-api.md).
 *
 * - Agrega el token de acceso (JWT) a cada pedido.
 * - Si el servidor responde 401, renueva el token UNA vez con el refresh y repite el pedido.
 *   Si tampoco se puede renovar, cierra la sesión (vuelve al login).
 * - Los errores llegan siempre como ApiError con un mensaje en español listo para mostrar.
 */

export interface Admin {
  id: number
  nombre: string
  email: string
}

export interface DatosSesion {
  access: string
  refresh: string
  admin: Admin
}

/** Dónde vive la sesión (localStorage en el navegador; en memoria en las pruebas). */
export interface AlmacenSesion {
  leer(): DatosSesion | null
  guardar(sesion: DatosSesion | null): void
}

export class ApiError extends Error {
  readonly status: number
  readonly codigo: string | null
  readonly detalle?: unknown

  constructor(mensaje: string, status: number, codigo: string | null = null, detalle?: unknown) {
    super(mensaje)
    this.name = 'ApiError'
    this.status = status
    this.codigo = codigo
    this.detalle = detalle
  }

  get sinConexion() {
    return this.status === 0
  }
}

interface OpcionesPedido {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  cuerpo?: unknown
  /** Sin token (login, refresh). */
  publico?: boolean
  senal?: AbortSignal
}

export class Api {
  private readonly base: string
  private readonly almacen: AlmacenSesion
  private readonly fetchFn: typeof fetch
  private renovando: Promise<boolean> | null = null

  constructor(almacen: AlmacenSesion, opciones: { base?: string; fetch?: typeof fetch } = {}) {
    this.almacen = almacen
    this.base = opciones.base ?? '/api/v1'
    this.fetchFn = opciones.fetch ?? ((...args) => fetch(...args))
  }

  /** Inicia sesión del administrador y la guarda. */
  async login(email: string, password: string): Promise<DatosSesion> {
    const datos = await this.pedir<DatosSesion>('auth/admin/login', {
      metodo: 'POST',
      cuerpo: { email: email.trim(), password },
      publico: true,
    })
    this.almacen.guardar(datos)
    return datos
  }

  cerrarSesion() {
    this.almacen.guardar(null)
  }

  get<T>(ruta: string, senal?: AbortSignal) {
    return this.pedir<T>(ruta, { senal })
  }

  post<T>(ruta: string, cuerpo?: unknown) {
    return this.pedir<T>(ruta, { metodo: 'POST', cuerpo })
  }

  put<T>(ruta: string, cuerpo?: unknown) {
    return this.pedir<T>(ruta, { metodo: 'PUT', cuerpo })
  }

  async pedir<T>(ruta: string, opciones: OpcionesPedido = {}): Promise<T> {
    const respuesta = await this.enviar(ruta, opciones)
    if (respuesta.status === 401 && !opciones.publico) {
      if (await this.renovar()) {
        return this.leer<T>(await this.enviar(ruta, opciones))
      }
      this.almacen.guardar(null)
      throw new ApiError('Tu sesión expiró. Vuelve a iniciar sesión.', 401, 'SESION_EXPIRADA')
    }
    return this.leer<T>(respuesta)
  }

  private async enviar(ruta: string, { metodo = 'GET', cuerpo, publico, senal }: OpcionesPedido) {
    const encabezados: Record<string, string> = { Accept: 'application/json' }
    if (cuerpo !== undefined) encabezados['Content-Type'] = 'application/json'
    const access = this.almacen.leer()?.access
    if (!publico && access) encabezados.Authorization = `Bearer ${access}`
    try {
      return await this.fetchFn(`${this.base}/${ruta.replace(/^\//, '')}`, {
        method: metodo,
        headers: encabezados,
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: senal,
      })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      throw new ApiError('No se pudo conectar con el servidor. Revisa tu conexión.', 0, 'SIN_CONEXION')
    }
  }

  /** Renueva el access con el refresh. Si varios pedidos fallan a la vez, renueva una sola vez. */
  private renovar(): Promise<boolean> {
    this.renovando ??= (async () => {
      const sesion = this.almacen.leer()
      if (!sesion) return false
      try {
        const { access } = await this.pedir<{ access: string }>('auth/refresh', {
          metodo: 'POST',
          cuerpo: { refresh: sesion.refresh },
          publico: true,
        })
        // Solo si nadie cerró la sesión mientras tanto
        const actual = this.almacen.leer()
        if (!actual) return false
        this.almacen.guardar({ ...actual, access })
        return true
      } catch {
        return false
      }
    })().finally(() => {
      this.renovando = null
    })
    return this.renovando
  }

  private async leer<T>(respuesta: Response): Promise<T> {
    const texto = await respuesta.text()
    let datos: unknown = null
    try {
      datos = texto ? JSON.parse(texto) : null
    } catch {
      // No es JSON (p. ej. una página de error del servidor)
    }
    if (respuesta.ok) return datos as T

    const cuerpo = (datos ?? {}) as { error?: string; codigo?: string; detalle?: unknown }
    const mensaje =
      cuerpo.error ??
      (respuesta.status >= 500
        ? `Error del servidor (${respuesta.status}). Intenta de nuevo en un momento.`
        : `No se pudo completar la acción (${respuesta.status}).`)
    throw new ApiError(mensaje, respuesta.status, cuerpo.codigo ?? null, cuerpo.detalle)
  }
}
