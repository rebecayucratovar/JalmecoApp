from django.db import connection

# Puntos con peor precisión que esto se ignoran al medir distancia (evita sumar "saltos" del GPS)
PRECISION_MAX_DISTANCIA_M = 50


def distancia_km(jornada_ids):
    """Distancia recorrida (km) sumando tramos entre puntos consecutivos de cada jornada (PostGIS)."""
    jornada_ids = list(jornada_ids)
    if not jornada_ids:
        return 0.0
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT COALESCE(SUM(tramo_m), 0) FROM (
                SELECT ST_Distance(
                           punto,
                           LAG(punto) OVER (PARTITION BY jornada_id ORDER BY registrado_en)
                       ) AS tramo_m
                FROM ubicacion
                WHERE jornada_id = ANY(%s)
                  AND (precision_m IS NULL OR precision_m <= %s)
            ) tramos
            """,
            [jornada_ids, PRECISION_MAX_DISTANCIA_M],
        )
        metros = cursor.fetchone()[0]
    return round(float(metros) / 1000, 1)
