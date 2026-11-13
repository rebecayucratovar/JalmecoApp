"""
Worker de Jalmeco GPS: corre las tareas periódicas del backend en un bucle (contenedor `worker`).

Uso:
    python manage.py worker              # bucle sin fin (lo que corre Docker)
    python manage.py worker --una-vez    # corre cada tarea una vez y termina (para probar)

Tareas (cada una aislada: si una falla, se registra el error y las demás siguen):
- Verificaciones vencidas → no_realizada + alerta ........ cada 1 min
- Sorteo de huellas al azar (~2 por día) .................. cada 1 min
- Alerta "Sin conexión" ................................... cada 1 min
- Alerta "Batería baja" ................................... cada 5 min
- Correo al administrador con las alertas nuevas ......... cada 1 min
- Retención: borrar datos de más de N meses ............... cada 24 h (y al arrancar)
- Cierre de jornadas sin salida marcada (fin del horario + 2 h) cada 5 min
- Odoo: asistencia → jornadas ............................. cada `odoo_sync_min` (1–2 min)
- Odoo: datos del personal importado (nombre, cargo, baja) . cada 1 h
(Las de Odoo no hacen nada mientras falten los datos de conexión en backend/.env.)
"""
import logging
import signal
import time
from dataclasses import dataclass
from typing import Callable

from django.core.management.base import BaseCommand
from django.db import close_old_connections

from alertas.correo import enviar_pendientes
from alertas.servicios import revisar_bateria, revisar_sin_conexion
from core.models import Configuracion
from core.retencion import limpiar
from jornadas.servicios import cerrar_olvidadas
from odoo_sync import servicios as odoo
from verificaciones import servicios as verificaciones

log = logging.getLogger('worker')

PASO_SEG = 15  # cada cuánto revisa qué tareas tocan


@dataclass
class Tarea:
    nombre: str
    cada_seg: int
    funcion: Callable[[], object]
    proxima: float = 0.0  # time.monotonic(); 0 = correr al arrancar


def _tareas():
    return [
        Tarea('verificaciones vencidas', 60, verificaciones.cerrar_vencidas),
        Tarea('sorteo de huellas', 60, lambda: verificaciones.programar(paso_min=1)),
        Tarea('sin conexión', 60, revisar_sin_conexion),
        Tarea('batería baja', 300, revisar_bateria),
        Tarea('correo de alertas', 60, enviar_pendientes),
        Tarea('odoo: asistencia', 60, odoo.tarea_asistencia),
        Tarea('salida no marcada', 300, cerrar_olvidadas),
        Tarea('odoo: personal', 3600, odoo.tarea_empleados),
        Tarea('retención', 24 * 3600, lambda: limpiar(Configuracion.actual().retencion_meses)),
    ]


class Command(BaseCommand):
    help = 'Corre las tareas periódicas (huellas, alertas, Odoo, retención).'

    def add_arguments(self, parser):
        parser.add_argument('--una-vez', action='store_true', help='Correr cada tarea una vez y salir')

    def handle(self, *args, una_vez=False, **options):
        logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s',
                            datefmt='%Y-%m-%d %H:%M:%S')
        self._seguir = True
        signal.signal(signal.SIGTERM, self._parar)  # docker compose stop
        signal.signal(signal.SIGINT, self._parar)  # Ctrl+C

        tareas = _tareas()
        log.info('Worker iniciado (%d tareas).', len(tareas))
        while self._seguir:
            ahora = time.monotonic()
            for tarea in tareas:
                if una_vez or ahora >= tarea.proxima:
                    self._correr(tarea)
                    tarea.proxima = ahora + tarea.cada_seg
            if una_vez:
                break
            self._dormir(PASO_SEG)
        log.info('Worker detenido.')

    def _correr(self, tarea):
        close_old_connections()  # por si la base se reinició entre vueltas
        inicio = time.monotonic()
        try:
            resultado = tarea.funcion()
        except Exception:
            log.exception('Falló la tarea "%s"', tarea.nombre)
            return
        # Solo se registra cuando hizo algo (si no, el log se llena de ceros)
        if resultado:
            log.info('%s: %s (%.1f s)', tarea.nombre, resultado, time.monotonic() - inicio)

    def _dormir(self, segundos):
        fin = time.monotonic() + segundos
        while self._seguir and time.monotonic() < fin:
            time.sleep(0.5)

    def _parar(self, *_):
        self._seguir = False
