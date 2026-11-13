"""
Recorrido del día de una persona: puntos, paradas, pausas y resumen (para el panel).

Las paradas se calculan al consultar (no se guardan): un día tiene a lo sumo unos miles de
puntos y el cálculo es inmediato. Algoritmo de "puntos de estadía": un grupo de puntos seguidos
que no se alejan más de RADIO_PARADA_M del primero durante al menos MIN_PARADA es una parada.
"""
import math
from dataclasses import dataclass
from datetime import datetime, time, timedelta

from django.utils import timezone

from core.pausas import franjas_activas, hoy_a_las
from jornadas.models import Jornada

from .models import Ubicacion

RADIO_PARADA_M = 100  # dentro de un edificio el GPS "salta" 30–60 m
MIN_PARADA = timedelta(minutes=5)
# Un hueco sin puntos más largo que esto corta el trayecto (GPS apagado, sin captura, almuerzo):
# no se dibuja una línea recta ni se suma distancia a través del hueco.
MAX_HUECO = timedelta(minutes=20)
MAX_PRECISION_M = 100  # puntos con peor precisión se ignoran (ubicación por antenas, no GPS)


@dataclass
class Punto:
    lat: float
    lng: float
    hora: datetime
    velocidad: float | None = None
    bateria: int | None = None


def distancia_m(a, b):
    """Distancia en metros entre dos puntos (haversine)."""
    r = 6_371_000
    f1, f2 = math.radians(a.lat), math.radians(b.lat)
    df, dl = f2 - f1, math.radians(b.lng - a.lng)
    h = math.sin(df / 2) ** 2 + math.cos(f1) * math.cos(f2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


MAX_VELOCIDAD_KMH = 180  # más rápido que esto entre dos lecturas = lectura falsa
PICO_M = 150  # se aleja y vuelve: "pico" del GPS


def limpiar(puntos):
    """
    Quita lecturas falsas del GPS (frecuentes bajo techo o junto a edificios):
    - duplicados (misma hora);
    - "picos": el punto se aleja más de PICO_M y el siguiente vuelve cerca del anterior;
    - saltos imposibles (más de MAX_VELOCIDAD_KMH desde el último punto válido).
    """
    sin_dup = [p for i, p in enumerate(puntos) if i == 0 or p.hora != puntos[i - 1].hora]
    salida = []
    for i, p in enumerate(sin_dup):
        if salida:
            prev = salida[-1]
            d = distancia_m(prev, p)
            sig = sin_dup[i + 1] if i + 1 < len(sin_dup) else None
            if (sig is not None and d > PICO_M and distancia_m(p, sig) > PICO_M
                    and distancia_m(prev, sig) < PICO_M and sig.hora - prev.hora <= MAX_HUECO):
                continue
            seg = (p.hora - prev.hora).total_seconds()
            if seg > 0 and d / seg * 3.6 > MAX_VELOCIDAD_KMH:
                continue
        salida.append(p)
    return salida


def tramos(puntos):
    """Divide los puntos en tramos continuos (se corta en los huecos largos)."""
    salida, actual = [], []
    for p in puntos:
        if actual and p.hora - actual[-1].hora > MAX_HUECO:
            salida.append(actual)
            actual = []
        actual.append(p)
    if actual:
        salida.append(actual)
    return salida


def calcular_paradas(puntos):
    """Paradas dentro de cada tramo continuo. Devuelve dicts con lat/lng (centro), inicio, fin, duracion_min."""
    paradas = []
    for tramo in tramos(puntos):
        i = 0
        while i < len(tramo):
            j = i
            while j + 1 < len(tramo) and distancia_m(tramo[i], tramo[j + 1]) <= RADIO_PARADA_M:
                j += 1
            if tramo[j].hora - tramo[i].hora >= MIN_PARADA:
                grupo = tramo[i:j + 1]
                paradas.append({
                    'lat': sum(p.lat for p in grupo) / len(grupo),
                    'lng': sum(p.lng for p in grupo) / len(grupo),
                    'inicio': tramo[i].hora,
                    'fin': tramo[j].hora,
                    'duracion_min': round((tramo[j].hora - tramo[i].hora).total_seconds() / 60),
                })
                i = j + 1
            else:
                i += 1
    return paradas


def distancia_total_m(puntos, paradas=()):
    """
    Metros recorridos. No suma a través de huecos largos ni DENTRO de una parada (quieto, el GPS
    "salta" decenas de metros entre lecturas y eso inflaría la distancia).
    """
    def en_parada(a, b):
        return any(p['inicio'] <= a.hora and b.hora <= p['fin'] for p in paradas)

    return sum(distancia_m(a, b) for tramo in tramos(puntos) for a, b in zip(tramo, tramo[1:]) if not en_parada(a, b))


def _solape(inicio, fin, desde, hasta):
    return max(timedelta(0), min(fin, hasta) - max(inicio, desde))


def recorrido_del_dia(tecnico, fecha, ahora=None):
    """Todo lo que muestra el panel para `tecnico` el día `fecha` (date, hora de La Paz)."""
    ahora = ahora or timezone.now()
    mediodia = timezone.make_aware(datetime.combine(fecha, time(12, 0)))
    desde = hoy_a_las(mediodia, time(0, 0))
    hasta = desde + timedelta(days=1)

    jornadas = list(Jornada.objects.filter(tecnico=tecnico, inicio__gte=desde, inicio__lt=hasta).order_by('inicio'))
    filas = (Ubicacion.objects.filter(jornada__in=jornadas)
             .exclude(precision_m__gt=MAX_PRECISION_M)
             .order_by('registrado_en')
             .values_list('punto', 'registrado_en', 'velocidad', 'bateria'))
    puntos = limpiar([Punto(lat=p.y, lng=p.x, hora=t, velocidad=v, bateria=b) for p, t, v, b in filas])
    paradas = calcular_paradas(puntos)

    # Pausas (almuerzo) de ese día. Van siempre que haya jornadas: si marcó salida y regreso del
    # almuerzo en Odoo (p. ej. 11:58 y 13:02) puede que ninguna jornada toque la franja, y el panel
    # igual muestra "Almuerzo" en el hueco entre las dos (ver web-admin …/recorrido/linea.ts).
    pausas = []
    for f in franjas_activas() if jornadas else []:
        if f.hora_inicio >= f.hora_fin:
            continue
        pausas.append({'nombre': f.nombre, 'inicio': hoy_a_las(mediodia, f.hora_inicio),
                       'fin': hoy_a_las(mediodia, f.hora_fin)})

    # Tiempo en jornada (sin las pausas) y tiempo en movimiento (en jornada, fuera de paradas)
    en_jornada = timedelta(0)
    for j in jornadas:
        fin = min(j.fin or ahora, ahora)
        if fin <= j.inicio:
            continue
        en_jornada += fin - j.inicio
        en_jornada -= sum((_solape(p['inicio'], p['fin'], j.inicio, fin) for p in pausas), timedelta(0))
    en_paradas = sum((p['fin'] - p['inicio'] for p in paradas), timedelta(0))

    return {
        'fecha': fecha,
        'jornadas': [{'id': j.id, 'inicio': j.inicio, 'fin': j.fin, 'estado': j.estado,
                      'cierre_automatico': j.cierre_automatico} for j in jornadas],
        'resumen': {
            'en_jornada_min': round(en_jornada.total_seconds() / 60),
            'en_paradas_min': round(en_paradas.total_seconds() / 60),
            'paradas': len(paradas),
            'distancia_km': round(distancia_total_m(puntos, paradas) / 1000, 2),
            'puntos': len(puntos),
        },
        'puntos': [{'lat': round(p.lat, 6), 'lng': round(p.lng, 6), 'hora': p.hora, 'velocidad': p.velocidad,
                    'bateria': p.bateria} for p in puntos],
        'paradas': paradas,
        'pausas': pausas,
    }
