from django.contrib.auth.hashers import check_password, make_password
from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator
from django.db import models
from django.utils import timezone


class Administrador(models.Model):
    """Usuario del panel web (tabla `administrador`)."""

    # Para usarlo como request.user en DRF (no son columnas de la base)
    TIPO_USUARIO = 'admin'
    is_authenticated = True
    is_anonymous = False

    id = models.AutoField(primary_key=True)
    nombre = models.CharField(max_length=120)
    email = models.EmailField(max_length=160, unique=True)
    password_hash = models.CharField(max_length=255)
    activo = models.BooleanField(default=True)
    creado_en = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'administrador'
        verbose_name = 'administrador'
        verbose_name_plural = 'administradores'

    def __str__(self):
        return f'{self.nombre} <{self.email}>'

    def set_password(self, raw_password):
        """Guarda la contraseña cifrada (nunca en texto plano)."""
        self.password_hash = make_password(raw_password)

    def check_password(self, raw_password):
        return check_password(raw_password, self.password_hash)


class TecnicoEstado(models.TextChoices):
    FUERA_JORNADA = 'fuera_jornada', 'Fuera de jornada'
    EN_TRAYECTO = 'en_trayecto', 'En trayecto'
    EN_PARADA = 'en_parada', 'En parada'
    SIN_CONEXION = 'sin_conexion', 'Sin conexión'


class Tecnico(models.Model):
    """Personal con la app móvil (tabla `tecnico`). Incluye a TODO el personal con celular."""

    Estado = TecnicoEstado

    # Para usarlo como request.user en DRF (no son columnas de la base)
    TIPO_USUARIO = 'tecnico'
    is_authenticated = True
    is_anonymous = False

    id = models.AutoField(primary_key=True)
    odoo_employee_id = models.IntegerField(unique=True, null=True, blank=True)  # hr.employee
    codigo = models.CharField(
        max_length=20, unique=True, null=True, blank=True,
        validators=[RegexValidator(r'^JAL-\d{4}$', 'El código debe tener el formato JAL-XXXX.')],
    )
    nombre = models.CharField(max_length=160)
    cargo = models.CharField(max_length=120, null=True, blank=True)  # de Odoo
    foto_url = models.TextField(null=True, blank=True)
    celular_modelo = models.CharField(max_length=80, null=True, blank=True)  # device_info_plus
    celular_numero = models.CharField(max_length=20, null=True, blank=True)  # +591, del Excel
    usuario = models.CharField(max_length=40, unique=True)
    pin_hash = models.CharField(max_length=255)  # PIN de 6 dígitos cifrado
    activo = models.BooleanField(default=True)

    # Último estado (denormalizado para el mapa en vivo)
    estado_actual = models.CharField(max_length=20, choices=Estado.choices, default=Estado.FUERA_JORNADA)
    ultima_lat = models.FloatField(null=True, blank=True)
    ultima_lng = models.FloatField(null=True, blank=True)
    ultima_bateria = models.SmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    ultima_actualizacion = models.DateTimeField(null=True, blank=True)
    creado_en = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'tecnico'
        verbose_name = 'técnico'
        verbose_name_plural = 'técnicos'
        constraints = [
            models.CheckConstraint(
                condition=models.Q(estado_actual__in=TecnicoEstado.values),
                name='tecnico_estado_actual_valido',
            ),
            models.CheckConstraint(
                condition=models.Q(ultima_bateria__gte=0, ultima_bateria__lte=100),
                name='tecnico_ultima_bateria_rango',
            ),
        ]

    def __str__(self):
        return f'{self.codigo or self.usuario} — {self.nombre}'

    def set_pin(self, raw_pin):
        """Guarda el PIN (6 dígitos) cifrado."""
        raw_pin = str(raw_pin)
        if not (len(raw_pin) == 6 and raw_pin.isdigit()):
            raise ValueError('El PIN debe tener exactamente 6 dígitos.')
        self.pin_hash = make_password(raw_pin)

    def check_pin(self, raw_pin):
        return check_password(str(raw_pin), self.pin_hash)
