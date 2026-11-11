from rest_framework import serializers


class JornadaActualSerializer(serializers.Serializer):
    inicio = serializers.DateTimeField()
    # Horario laboral esperado, de Configuracion (ej. "08:00–18:00")
    horario = serializers.CharField(allow_null=True)


class FranjaHorariaSerializer(serializers.Serializer):
    inicio = serializers.TimeField(format='%H:%M')
    fin = serializers.TimeField(format='%H:%M')


class ResumenHoySerializer(serializers.Serializer):
    tiempo_jornada_min = serializers.IntegerField()
    distancia_km = serializers.FloatField()


class MiEstadoSerializer(serializers.Serializer):
    en_jornada = serializers.BooleanField()
    jornada = JornadaActualSerializer(allow_null=True)
    en_pausa_almuerzo = serializers.BooleanField()
    franja_almuerzo = FranjaHorariaSerializer(allow_null=True)
    resumen_hoy = ResumenHoySerializer()
