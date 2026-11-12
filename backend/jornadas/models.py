from django.contrib.gis.db import models
from django.db.models import Q


class JornadaEstado(models.TextChoices):
    ACTIVA = 'activa', 'Activa'
    CERRADA = 'cerrada', 'Cerrada'


class Jornada(models.Model):
    """De la marca de entrada a la de salida (según hr.attendance de Odoo)."""

    Estado = JornadaEstado

    id = models.BigAutoField(primary_key=True)
    tecnico = models.ForeignKey(
        'usuarios.Tecnico', on_delete=models.CASCADE, related_name='jornadas', db_index=False,
    )
    odoo_attendance_id = models.BigIntegerField(null=True, blank=True)  # hr.attendance
    inicio = models.DateTimeField()  # marca de entrada
    fin = models.DateTimeField(null=True, blank=True)  # marca de salida (NULL si sigue)
    ubicacion_inicio = models.PointField(geography=True, srid=4326, null=True, blank=True, spatial_index=False)
    ubicacion_fin = models.PointField(geography=True, srid=4326, null=True, blank=True, spatial_index=False)
    estado = models.CharField(max_length=10, choices=Estado.choices, default=Estado.ACTIVA)
    # La cerró el sistema porque no marcó salida en Odoo (jornadas/servicios.py). La sincronización
    # no la reabre aunque en Odoo siga abierta.
    cierre_automatico = models.BooleanField(default=False)

    class Meta:
        db_table = 'jornada'
        verbose_name = 'jornada'
        verbose_name_plural = 'jornadas'
        indexes = [
            models.Index(fields=['tecnico', 'inicio'], name='idx_jornada_tecnico'),
            models.Index(fields=['tecnico'], name='idx_jornada_activa', condition=Q(estado='activa')),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(estado__in=JornadaEstado.values),
                name='jornada_estado_valido',
            ),
        ]

    def __str__(self):
        return f'Jornada {self.pk} — {self.tecnico_id} ({self.estado})'
