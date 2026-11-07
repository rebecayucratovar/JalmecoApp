from django.db import models
from django.db.models import Q
from django.utils import timezone


class VerificacionResultado(models.TextChoices):
    PENDIENTE = 'pendiente', 'Pendiente'
    EXITO = 'exito', 'Éxito'
    NO_REALIZADA = 'no_realizada', 'No realizada'


class Verificacion(models.Model):
    """Solicitud de verificación de identidad por huella."""

    Resultado = VerificacionResultado

    id = models.BigAutoField(primary_key=True)
    tecnico = models.ForeignKey(
        'usuarios.Tecnico', on_delete=models.CASCADE, related_name='verificaciones', db_index=False,
    )
    jornada = models.ForeignKey(
        'jornadas.Jornada', on_delete=models.CASCADE, related_name='verificaciones',
        null=True, blank=True, db_index=False,
    )
    solicitada_en = models.DateTimeField(default=timezone.now)
    respondida_en = models.DateTimeField(null=True, blank=True)
    resultado = models.CharField(max_length=15, choices=Resultado.choices, default=Resultado.PENDIENTE)

    class Meta:
        db_table = 'verificacion'
        verbose_name = 'verificación'
        verbose_name_plural = 'verificaciones'
        indexes = [
            models.Index(fields=['tecnico', 'solicitada_en'], name='idx_verificacion_tecnico'),
            models.Index(fields=['jornada'], name='idx_verificacion_jornada'),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(resultado__in=VerificacionResultado.values),
                name='verificacion_resultado_valido',
            ),
        ]

    def __str__(self):
        return f'Verificación {self.pk} — {self.tecnico_id} ({self.resultado})'
