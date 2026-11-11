import datetime

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q


class FranjaPausa(models.Model):
    """Ventanas sin rastreo por privacidad (p. ej. Almuerzo 12:00–13:00, hora America/La_Paz)."""

    id = models.AutoField(primary_key=True)
    nombre = models.CharField(max_length=60)
    hora_inicio = models.TimeField()
    hora_fin = models.TimeField()
    activa = models.BooleanField(default=True)

    class Meta:
        db_table = 'franja_pausa'
        verbose_name = 'franja de pausa'
        verbose_name_plural = 'franjas de pausa'

    def __str__(self):
        return f'{self.nombre} ({self.hora_inicio:%H:%M}–{self.hora_fin:%H:%M})'


class Configuracion(models.Model):
    """Parámetros globales del sistema (una sola fila)."""

    id = models.AutoField(primary_key=True)
    retencion_meses = models.IntegerField(default=12)  # borrar datos más viejos
    verificaciones_por_dia = models.IntegerField(default=2)  # huellas por jornada
    verificacion_limite_min = models.IntegerField(default=3)  # minutos para responder
    # Cada cuánto leer la asistencia (entrada/salida) de Odoo: 1 o 2 min como máximo
    odoo_sync_min = models.IntegerField(default=2, validators=[MinValueValidator(1), MaxValueValidator(2)])
    espejo_odoo_min = models.IntegerField(default=8)  # subir última ubicación a Odoo
    # Horario laboral esperado (el almuerzo está en franja_pausa). Solo informativo:
    # la jornada real la marcan la entrada/salida de Odoo.
    horario_inicio = models.TimeField(default=datetime.time(8, 0))
    horario_fin = models.TimeField(default=datetime.time(18, 0))
    # Captura GPS de la app: un punto cada vez que se mueve N metros, o cada N segundos si
    # está quieto (así el panel sabe que sigue conectado aunque no se mueva).
    gps_distancia_m = models.IntegerField(default=25, validators=[MinValueValidator(5), MaxValueValidator(500)])
    gps_intervalo_seg = models.IntegerField(default=120, validators=[MinValueValidator(30), MaxValueValidator(900)])
    # Alertas del worker: "Sin conexión" si no llegan datos en N minutos (en jornada, fuera del
    # almuerzo) y "Batería baja" al bajar de N % (una vez por jornada).
    sin_conexion_min = models.IntegerField(default=10, validators=[MinValueValidator(3), MaxValueValidator(60)])
    bateria_baja_pct = models.IntegerField(default=15, validators=[MinValueValidator(5), MaxValueValidator(50)])
    # Estado (no es un parámetro): última sincronización correcta con Odoo. Se va pisando.
    odoo_ultima_sync_ok = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'configuracion'
        verbose_name = 'configuración'
        verbose_name_plural = 'configuración'
        constraints = [
            models.CheckConstraint(condition=Q(odoo_sync_min__gte=1, odoo_sync_min__lte=2),
                                   name='configuracion_odoo_sync_min_rango'),
            models.CheckConstraint(condition=Q(gps_distancia_m__gte=5, gps_distancia_m__lte=500),
                                   name='configuracion_gps_distancia_rango'),
            models.CheckConstraint(condition=Q(gps_intervalo_seg__gte=30, gps_intervalo_seg__lte=900),
                                   name='configuracion_gps_intervalo_rango'),
            models.CheckConstraint(condition=Q(sin_conexion_min__gte=3, sin_conexion_min__lte=60),
                                   name='configuracion_sin_conexion_rango'),
            models.CheckConstraint(condition=Q(bateria_baja_pct__gte=5, bateria_baja_pct__lte=50),
                                   name='configuracion_bateria_baja_rango'),
        ]

    def __str__(self):
        return 'Configuración del sistema'

    @classmethod
    def actual(cls):
        """La única fila de configuración (la crea con valores por defecto si faltara)."""
        return cls.objects.order_by('id').first() or cls.objects.create()

    @property
    def horario_texto(self):
        return f'{self.horario_inicio:%H:%M}–{self.horario_fin:%H:%M}'
