from django.contrib.gis.db import models
from django.contrib.postgres.indexes import GistIndex
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db.models import Q


class Ubicacion(models.Model):
    """Cada punto GPS enviado por la app (la tabla que más crece)."""

    id = models.BigAutoField(primary_key=True)
    tecnico = models.ForeignKey(
        'usuarios.Tecnico', on_delete=models.CASCADE, related_name='ubicaciones', db_index=False,
    )
    jornada = models.ForeignKey(
        'jornadas.Jornada', on_delete=models.CASCADE, related_name='ubicaciones',
        null=True, blank=True, db_index=False,
    )
    # El índice espacial se declara en Meta con su nombre del esquema (idx_ubicacion_punto)
    punto = models.PointField(geography=True, srid=4326, spatial_index=False)
    precision_m = models.FloatField(null=True, blank=True)  # exactitud en metros
    velocidad = models.FloatField(null=True, blank=True)  # km/h
    bateria = models.SmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    registrado_en = models.DateTimeField()  # cuándo lo capturó el celular
    recibido_en = models.DateTimeField(auto_now_add=True)  # cuándo llegó al servidor

    class Meta:
        db_table = 'ubicacion'
        verbose_name = 'ubicación'
        verbose_name_plural = 'ubicaciones'
        indexes = [
            models.Index(fields=['tecnico', 'registrado_en'], name='idx_ubicacion_tecnico_fecha'),
            models.Index(fields=['jornada'], name='idx_ubicacion_jornada'),
            GistIndex(fields=['punto'], name='idx_ubicacion_punto'),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(bateria__gte=0, bateria__lte=100),
                name='ubicacion_bateria_rango',
            ),
        ]

    def __str__(self):
        return f'{self.tecnico_id} @ {self.registrado_en:%Y-%m-%d %H:%M:%S}'


class Parada(models.Model):
    """Paradas calculadas (para la línea de tiempo del recorrido)."""

    id = models.BigAutoField(primary_key=True)
    jornada = models.ForeignKey(
        'jornadas.Jornada', on_delete=models.CASCADE, related_name='paradas', db_index=False,
    )
    punto = models.PointField(geography=True, srid=4326, spatial_index=False)
    inicio = models.DateTimeField()
    fin = models.DateTimeField(null=True, blank=True)
    duracion_min = models.IntegerField(null=True, blank=True)
    direccion = models.TextField(null=True, blank=True)  # dirección aproximada

    class Meta:
        db_table = 'parada'
        verbose_name = 'parada'
        verbose_name_plural = 'paradas'
        indexes = [
            models.Index(fields=['jornada'], name='idx_parada_jornada'),
        ]

    def __str__(self):
        return f'Parada {self.pk} — jornada {self.jornada_id}'
