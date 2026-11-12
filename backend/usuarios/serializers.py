import re

from django.db.models import Q
from rest_framework import serializers

from .models import Administrador, Tecnico


# ---------- Objetos de respuesta ----------

class AdministradorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Administrador
        fields = ['id', 'nombre', 'email']


class TecnicoResumenSerializer(serializers.ModelSerializer):
    """TecnicoResumen del contrato (mapa, lista y fichas)."""

    class Meta:
        model = Tecnico
        fields = [
            'id', 'codigo', 'nombre', 'cargo', 'foto_url',
            'estado_actual', 'ultima_lat', 'ultima_lng', 'ultima_bateria', 'ultima_velocidad',
            'ultima_actualizacion',
            'celular_modelo', 'celular_numero',
        ]


class TokensSerializer(serializers.Serializer):
    access = serializers.CharField()
    refresh = serializers.CharField()


class LoginAdminRespuestaSerializer(TokensSerializer):
    admin = AdministradorSerializer()


class LoginTecnicoRespuestaSerializer(TokensSerializer):
    tecnico = TecnicoResumenSerializer()


class RefreshRespuestaSerializer(serializers.Serializer):
    access = serializers.CharField()


# ---------- Peticiones ----------

class LoginAdminSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False)


class LoginTecnicoSerializer(serializers.Serializer):
    usuario = serializers.CharField(max_length=120)
    pin = serializers.RegexField(r'^\d{6}$', error_messages={'invalid': 'El PIN debe tener 6 dígitos.'})


class RefreshSerializer(serializers.Serializer):
    refresh = serializers.CharField()


# ---------- App móvil: perfil, dispositivo, seguimiento ----------

class FranjaSerializer(serializers.Serializer):
    inicio = serializers.TimeField(format='%H:%M')
    fin = serializers.TimeField(format='%H:%M')


class RastreoSerializer(serializers.Serializer):
    """Cómo captura la app: cada `distancia_m` metros o cada `intervalo_seg` si está quieto."""

    distancia_m = serializers.IntegerField()
    intervalo_seg = serializers.IntegerField()


class PoliticasSerializer(serializers.Serializer):
    horario = serializers.CharField()
    franja_almuerzo = FranjaSerializer(allow_null=True)
    retencion_meses = serializers.IntegerField()
    verificaciones_por_dia = serializers.IntegerField()
    rastreo = RastreoSerializer()


class PerfilTecnicoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tecnico
        fields = [
            'id', 'codigo', 'usuario', 'nombre', 'cargo', 'foto_url',
            'celular_modelo', 'celular_numero', 'equipo_modelo',
        ]


class MiPerfilSerializer(serializers.Serializer):
    tecnico = PerfilTecnicoSerializer()
    politicas = PoliticasSerializer()


class DispositivoSerializer(serializers.Serializer):
    """Equipo detectado por la app. `equipo_id` = Android ID (estable por app y equipo)."""

    equipo_id = serializers.CharField(max_length=64)
    equipo_modelo = serializers.CharField(max_length=80)


class DispositivoRespuestaSerializer(serializers.Serializer):
    ok = serializers.BooleanField()
    cambio_equipo = serializers.BooleanField()


MOTIVOS_SEGUIMIENTO = {
    'cerro_sesion': 'Cerró sesión durante la jornada',
    'permiso_revocado': 'Quitó el permiso de ubicación',
    'gps_apagado': 'Apagó la ubicación (GPS) del celular',
}


class SeguimientoDetenidoSerializer(serializers.Serializer):
    motivo = serializers.ChoiceField(choices=list(MOTIVOS_SEGUIMIENTO))


class SeguimientoDetenidoRespuestaSerializer(serializers.Serializer):
    ok = serializers.BooleanField()
    alerta_creada = serializers.BooleanField()


# ---------- Panel admin: técnicos ----------

# Lo que NO se muestra de quien está fuera de jornada (solo se rastrea en jornada)
CAMPOS_PRIVADOS = ['ultima_lat', 'ultima_lng', 'ultima_bateria', 'ultima_velocidad', 'ultima_actualizacion']


class TecnicoEnVivoSerializer(TecnicoResumenSerializer):
    """
    TecnicoResumen + desde cuándo está en jornada. Requiere el queryset de `con_jornada()`.
    Fuera de jornada: estado "fuera_jornada" y SIN ubicación (privacidad).
    """

    jornada_inicio = serializers.DateTimeField(allow_null=True)

    class Meta(TecnicoResumenSerializer.Meta):
        fields = TecnicoResumenSerializer.Meta.fields + ['jornada_inicio']

    def to_representation(self, tecnico):
        datos = super().to_representation(tecnico)
        if not getattr(tecnico, 'en_jornada', False):
            datos['estado_actual'] = Tecnico.Estado.FUERA_JORNADA
            datos.update({campo: None for campo in CAMPOS_PRIVADOS})
        return datos


class TecnicoAdminSerializer(TecnicoEnVivoSerializer):
    """Lo que ve el panel en la lista y la ficha: + acceso a la app y equipo detectado."""

    class Meta(TecnicoEnVivoSerializer.Meta):
        fields = TecnicoEnVivoSerializer.Meta.fields + [
            'usuario', 'usuario_de_odoo', 'activo', 'tiene_pin', 'pin_generado_en',
            'equipo_modelo', 'equipo_registrado_en', 'odoo_employee_id', 'creado_en',
        ]


# Si la persona viene de Odoo, estos datos se cambian en Odoo (la sincronización los pisaría).
# El usuario, solo si vino de Odoo (`usuario_de_odoo`); si no, es generado y se puede cambiar aquí.
CAMPOS_DE_ODOO = ['nombre', 'cargo']


def normalizar_celular(valor):
    """'71245830' / '+591 712 45830' / '59171245830' → '+591 71245830'. Solo celulares de Bolivia."""
    digitos = re.sub(r'\D', '', valor or '')
    if not digitos:
        return None
    if len(digitos) == 11 and digitos.startswith('591'):
        digitos = digitos[3:]
    if len(digitos) != 8 or digitos[0] not in '67':
        raise serializers.ValidationError('Debe ser un celular de Bolivia: 8 dígitos que empiezan con 6 o 7.')
    return f'+591 {digitos}'


class TecnicoEscrituraSerializer(serializers.ModelSerializer):
    """Alta y edición desde el panel (mientras no haya importación de Odoo, o para quien no esté)."""

    nombre = serializers.CharField(max_length=160)
    codigo = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True)
    usuario = serializers.CharField(max_length=120, required=False, allow_blank=True)
    cargo = serializers.CharField(max_length=120, required=False, allow_blank=True, allow_null=True)
    celular_modelo = serializers.CharField(max_length=80, required=False, allow_blank=True, allow_null=True)
    celular_numero = serializers.CharField(max_length=30, required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = Tecnico
        fields = ['nombre', 'codigo', 'usuario', 'cargo', 'celular_modelo', 'celular_numero', 'activo']

    def validate_nombre(self, valor):
        valor = ' '.join(valor.split())
        if len(valor) < 3:
            raise serializers.ValidationError('Escribe el nombre completo.')
        return valor

    def validate_codigo(self, valor):
        valor = (valor or '').strip().upper()
        if not valor:
            return None
        if not re.fullmatch(r'JAL-\d{4}', valor):
            raise serializers.ValidationError('El código debe tener el formato JAL-XXXX (4 números).')
        return valor

    def validate_usuario(self, valor):
        valor = (valor or '').strip()
        if valor and not re.fullmatch(r'[A-Za-z0-9._@-]+', valor):
            raise serializers.ValidationError('Solo letras, números y . _ @ - (sin espacios).')
        return valor

    def validate_cargo(self, valor):
        return ' '.join((valor or '').split()) or None

    def validate_celular_modelo(self, valor):
        return ' '.join((valor or '').split()) or None

    def validate_celular_numero(self, valor):
        return normalizar_celular(valor)

    def validate(self, datos):
        actual = self.instance
        # Usuario: si no se indica, es el código (como en Odoo cuando la persona no tiene usuario)
        codigo = datos.get('codigo', actual.codigo if actual else None)
        if not datos.get('usuario'):
            if 'usuario' in datos or actual is None:
                if not codigo:
                    raise serializers.ValidationError({'usuario': 'Indica el usuario o el código JAL-XXXX.'})
                datos['usuario'] = codigo
        usuario = datos.get('usuario', actual.usuario if actual else None)

        if actual is not None and actual.odoo_employee_id:
            for campo in CAMPOS_DE_ODOO + (['usuario'] if actual.usuario_de_odoo else []):
                if campo in datos and datos[campo] != getattr(actual, campo):
                    raise serializers.ValidationError({campo: 'Este dato viene de Odoo: cámbialo en Odoo.'})

        # El login acepta usuario O código: ninguno puede repetirse entre personas (ni cruzado)
        otros = Tecnico.objects.exclude(pk=actual.pk) if actual else Tecnico.objects.all()
        for campo, valor in (('usuario', usuario), ('codigo', codigo)):
            if valor and otros.filter(Q(usuario__iexact=valor) | Q(codigo__iexact=valor)).exists():
                raise serializers.ValidationError({campo: f'«{valor}» ya lo usa otra persona.'})
        return datos


class PinGeneradoSerializer(serializers.Serializer):
    pin = serializers.CharField()
    generado_en = serializers.DateTimeField()
