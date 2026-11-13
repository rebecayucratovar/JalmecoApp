from django.db import models
from django.db.models import Q
from django.utils import timezone


class AlertaTipo(models.TextChoices):
    SIN_CONEXION = 'sin_conexion', 'Sin conexión'
    BATERIA_BAJA = 'bateria_baja', 'Batería baja'
    VERIFICACION_NO_REALIZADA = 'verificacion_no_realizada', 'Verificación no realizada'
    CAMBIO_EQUIPO = 'cambio_equipo', 'Cambio de equipo'
    SEGUIMIENTO_DETENIDO = 'seguimiento_detenido', 'Seguimiento detenido'
    SALIDA_NO_MARCADA = 'salida_no_marcada', 'Salida no marcada'


class AlertaNivel(models.TextChoices):
    INFO = 'info', 'Info'
    ADVERTENCIA = 'advertencia', 'Advertencia'
    CRITICO = 'critico', 'Crítico'


class AlertaEstado(models.TextChoices):
    NUEVA = 'nueva', 'Nueva'
    ATENDIDA = 'atendida', 'Atendida'


class Alerta(models.Model):
    """Alertas para el panel (sin conexión, batería baja, huella, cambio de equipo, seguimiento detenido,
    salida no marcada)."""

    Tipo = AlertaTipo
    Nivel = AlertaNivel
    Estado = AlertaEstado

    id = models.BigAutoField(primary_key=True)
    tecnico = models.ForeignKey(
        'usuarios.Tecnico', on_delete=models.CASCADE, related_name='alertas', db_index=False,
    )
    tipo = models.CharField(max_length=30, choices=Tipo.choices)
    mensaje = models.TextField(null=True, blank=True)
    nivel = models.CharField(max_length=12, choices=Nivel.choices, default=Nivel.ADVERTENCIA)
    creada_en = models.DateTimeField(default=timezone.now)
    estado = models.CharField(max_length=10, choices=Estado.choices, default=Estado.NUEVA)
    atendida_por = models.ForeignKey(
        'usuarios.Administrador', on_delete=models.SET_NULL, related_name='alertas_atendidas',
        null=True, blank=True, db_column='atendida_por',
    )
    atendida_en = models.DateTimeField(null=True, blank=True)
    # Cuándo se avisó por correo (NULL = falta enviarla; la envía el worker)
    notificada_en = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'alerta'
        verbose_name = 'alerta'
        verbose_name_plural = 'alertas'
        indexes = [
            models.Index(fields=['estado', 'creada_en'], name='idx_alerta_estado'),
            models.Index(fields=['tecnico'], name='idx_alerta_tecnico'),
        ]
        constraints = [
            models.CheckConstraint(condition=Q(tipo__in=AlertaTipo.values), name='alerta_tipo_valido'),
            models.CheckConstraint(condition=Q(nivel__in=AlertaNivel.values), name='alerta_nivel_valido'),
            models.CheckConstraint(condition=Q(estado__in=AlertaEstado.values), name='alerta_estado_valido'),
        ]

    def __str__(self):
        return f'{self.get_tipo_display()} — {self.tecnico_id} ({self.estado})'
