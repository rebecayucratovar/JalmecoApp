from django.db import models


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
    odoo_sync_min = models.IntegerField(default=2)  # cada cuánto leer asistencia
    espejo_odoo_min = models.IntegerField(default=8)  # subir última ubicación a Odoo

    class Meta:
        db_table = 'configuracion'
        verbose_name = 'configuración'
        verbose_name_plural = 'configuración'

    def __str__(self):
        return 'Configuración del sistema'
