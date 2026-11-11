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
    usuario = serializers.CharField(max_length=40)
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
