from datetime import timedelta

from django.db import models
from django.db.models import Q
from django.utils import timezone


class SincronizacionTipo(models.TextChoices):
    ASISTENCIA = 'asistencia', 'Asistencia'  # hr.attendance → abrir/cerrar jornadas
    EMPLEADOS = 'empleados', 'Empleados'  # hr.employee → importar personal y cargo
    ESPEJO = 'espejo', 'Espejo'  # subir última ubicación al empleado (Fase 2)


class SincronizacionResultado(models.TextChoices):
    OK = 'ok', 'Correcta'
    ERROR = 'error', 'Error'


class SincronizacionOdoo(models.Model):
    """
    Historial de sincronizaciones con Odoo (pantalla "Integración Odoo" del panel).

    Solo se guardan las que trajeron registros ("16:30 · asistencia · 2 registros") y las que
    fallaron ("15:45 · tiempo de espera agotado, reintentado"). Las corridas vacías (cada 1–2 min)
    no se guardan: solo actualizan Configuracion.odoo_ultima_sync_ok. Usar `registrar()`.
    """

    Tipo = SincronizacionTipo
    Resultado = SincronizacionResultado

    id = models.BigAutoField(primary_key=True)
    fecha = models.DateTimeField(default=timezone.now)
    tipo = models.CharField(max_length=15, choices=Tipo.choices)
    resultado = models.CharField(max_length=10, choices=Resultado.choices)
    registros = models.IntegerField(default=0)
    mensaje = models.TextField(null=True, blank=True)  # detalle del error

    class Meta:
        db_table = 'sincronizacion_odoo'
        verbose_name = 'sincronización con Odoo'
        verbose_name_plural = 'sincronizaciones con Odoo'
        indexes = [models.Index(fields=['fecha'], name='idx_sincronizacion_fecha')]
        constraints = [
            models.CheckConstraint(condition=Q(tipo__in=SincronizacionTipo.values), name='sincronizacion_tipo_valido'),
            models.CheckConstraint(
                condition=Q(resultado__in=SincronizacionResultado.values), name='sincronizacion_resultado_valido',
            ),
        ]

    def __str__(self):
        return f'{self.fecha:%Y-%m-%d %H:%M} · {self.tipo} · {self.resultado}'

    @classmethod
    def registrar(cls, tipo, registros=0, error=None):
        """
        Anota el resultado de una corrida del worker.
        - Correcta: pisa la "última sincronización OK" y guarda fila solo si hubo registros.
        - Con error: guarda fila, salvo que sea el mismo error de la última corrida de ese tipo en
          la última hora (si Odoo se cae, no llenar el historial con una fila por minuto).
        """
        from core.models import Configuracion

        ahora = timezone.now()
        if error:
            anterior = cls.objects.filter(tipo=tipo).order_by('-fecha').first()
            if (anterior and anterior.resultado == cls.Resultado.ERROR and anterior.mensaje == str(error)
                    and ahora - anterior.fecha < timedelta(hours=1)):
                return None
            return cls.objects.create(
                fecha=ahora, tipo=tipo, resultado=cls.Resultado.ERROR, registros=registros, mensaje=str(error),
            )
        Configuracion.objects.filter(pk=Configuracion.actual().pk).update(odoo_ultima_sync_ok=ahora)
        if registros:
            return cls.objects.create(fecha=ahora, tipo=tipo, resultado=cls.Resultado.OK, registros=registros)
        return None
