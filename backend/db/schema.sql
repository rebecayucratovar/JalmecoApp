-- =====================================================================
--  Jalmeco Campo — Esquema de base de datos
--  PostgreSQL + PostGIS  ·  Sistema de seguimiento de personal en campo
--  Zona horaria de referencia: America/La_Paz
--
--  Uso: crear una base vacía y ejecutar este script completo.
--  (La tabla "tecnico" representa a TODO el personal con celular de la empresa.)
-- =====================================================================

-- Extensión geográfica: necesaria para los puntos GPS y los cálculos de distancia.
CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------
--  administrador — usuarios del panel web
-- ---------------------------------------------------------------------
CREATE TABLE administrador (
    id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre         VARCHAR(120)  NOT NULL,
    email          VARCHAR(160)  NOT NULL UNIQUE,
    password_hash  VARCHAR(255)  NOT NULL,
    activo         BOOLEAN       NOT NULL DEFAULT TRUE,
    creado_en      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
--  tecnico — personal con app móvil (login con usuario/código + PIN)
-- ---------------------------------------------------------------------
CREATE TABLE tecnico (
    id                   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    odoo_employee_id     INT          UNIQUE,         -- vínculo con hr.employee
    codigo               VARCHAR(20)  UNIQUE,         -- JAL-XXXX (de Odoo)
    nombre               VARCHAR(160) NOT NULL,
    cargo                VARCHAR(120),                -- de Odoo
    foto_url             TEXT,
    celular_modelo       VARCHAR(80),                 -- autocompletado por la app
    celular_numero       VARCHAR(20),                 -- +591, del Excel
    usuario              VARCHAR(40)  NOT NULL UNIQUE, -- login
    pin_hash             VARCHAR(255) NOT NULL,       -- PIN de 6 dígitos cifrado
    activo               BOOLEAN      NOT NULL DEFAULT TRUE,
    -- Último estado (denormalizado, para que el mapa en vivo cargue rápido)
    estado_actual        VARCHAR(20)  NOT NULL DEFAULT 'fuera_jornada'
                         CHECK (estado_actual IN
                           ('fuera_jornada','en_trayecto','en_parada','sin_conexion')),
    ultima_lat           DOUBLE PRECISION,
    ultima_lng           DOUBLE PRECISION,
    ultima_bateria       SMALLINT     CHECK (ultima_bateria BETWEEN 0 AND 100),
    ultima_actualizacion TIMESTAMPTZ,
    creado_en            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
--  jornada — de la entrada a la salida (según la asistencia de Odoo)
-- ---------------------------------------------------------------------
CREATE TABLE jornada (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tecnico_id          INT          NOT NULL REFERENCES tecnico(id) ON DELETE CASCADE,
    odoo_attendance_id  BIGINT,                           -- vínculo con hr.attendance
    inicio              TIMESTAMPTZ  NOT NULL,             -- marca de entrada
    fin                 TIMESTAMPTZ,                       -- marca de salida (NULL si sigue)
    ubicacion_inicio    geography(Point, 4326),
    ubicacion_fin       geography(Point, 4326),
    estado              VARCHAR(10)  NOT NULL DEFAULT 'activa'
                        CHECK (estado IN ('activa','cerrada'))
);

-- ---------------------------------------------------------------------
--  ubicacion — cada punto GPS (la tabla que más crece)
-- ---------------------------------------------------------------------
CREATE TABLE ubicacion (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tecnico_id    INT          NOT NULL REFERENCES tecnico(id) ON DELETE CASCADE,
    jornada_id    BIGINT       REFERENCES jornada(id) ON DELETE CASCADE,
    punto         geography(Point, 4326) NOT NULL,        -- lat/lng
    precision_m   REAL,                                   -- exactitud en metros
    velocidad     REAL,                                   -- km/h
    bateria       SMALLINT     CHECK (bateria BETWEEN 0 AND 100),
    registrado_en TIMESTAMPTZ  NOT NULL,                  -- cuándo lo capturó el celular
    recibido_en   TIMESTAMPTZ  NOT NULL DEFAULT now()     -- cuándo llegó al servidor
);

-- ---------------------------------------------------------------------
--  parada — paradas calculadas (para la línea de tiempo del recorrido)
-- ---------------------------------------------------------------------
CREATE TABLE parada (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    jornada_id    BIGINT       NOT NULL REFERENCES jornada(id) ON DELETE CASCADE,
    punto         geography(Point, 4326) NOT NULL,
    inicio        TIMESTAMPTZ  NOT NULL,
    fin           TIMESTAMPTZ,
    duracion_min  INT,
    direccion     TEXT                                    -- dirección aproximada
);

-- ---------------------------------------------------------------------
--  alerta
-- ---------------------------------------------------------------------
CREATE TABLE alerta (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tecnico_id    INT          NOT NULL REFERENCES tecnico(id) ON DELETE CASCADE,
    tipo          VARCHAR(30)  NOT NULL
                  CHECK (tipo IN ('sin_conexion','bateria_baja','verificacion_no_realizada')),
    mensaje       TEXT,
    nivel         VARCHAR(12)  NOT NULL DEFAULT 'advertencia'
                  CHECK (nivel IN ('info','advertencia','critico')),
    creada_en     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    estado        VARCHAR(10)  NOT NULL DEFAULT 'nueva'
                  CHECK (estado IN ('nueva','atendida')),
    atendida_por  INT          REFERENCES administrador(id) ON DELETE SET NULL,
    atendida_en   TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
--  franja_pausa — ventanas sin rastreo (privacidad, p. ej. almuerzo)
-- ---------------------------------------------------------------------
CREATE TABLE franja_pausa (
    id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre      VARCHAR(60) NOT NULL,
    hora_inicio TIME        NOT NULL,
    hora_fin    TIME        NOT NULL,
    activa      BOOLEAN     NOT NULL DEFAULT TRUE
);

-- ---------------------------------------------------------------------
--  verificacion — verificación de identidad por huella
-- ---------------------------------------------------------------------
CREATE TABLE verificacion (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tecnico_id    INT          NOT NULL REFERENCES tecnico(id) ON DELETE CASCADE,
    jornada_id    BIGINT       REFERENCES jornada(id) ON DELETE CASCADE,
    solicitada_en TIMESTAMPTZ  NOT NULL DEFAULT now(),
    respondida_en TIMESTAMPTZ,
    resultado     VARCHAR(15)  NOT NULL DEFAULT 'pendiente'
                  CHECK (resultado IN ('pendiente','exito','no_realizada'))
);

-- ---------------------------------------------------------------------
--  configuracion — parámetros globales del sistema (una sola fila)
-- ---------------------------------------------------------------------
CREATE TABLE configuracion (
    id                       INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    retencion_meses          INT NOT NULL DEFAULT 12,   -- borrar datos más viejos
    verificaciones_por_dia   INT NOT NULL DEFAULT 2,    -- huellas por jornada
    verificacion_limite_min  INT NOT NULL DEFAULT 3,    -- minutos para responder
    odoo_sync_min            INT NOT NULL DEFAULT 2,    -- cada cuánto leer asistencia
    espejo_odoo_min          INT NOT NULL DEFAULT 8     -- subir última ubicación a Odoo
);

-- =====================================================================
--  ÍNDICES
-- =====================================================================
CREATE INDEX idx_ubicacion_tecnico_fecha ON ubicacion (tecnico_id, registrado_en);
CREATE INDEX idx_ubicacion_jornada       ON ubicacion (jornada_id);
CREATE INDEX idx_ubicacion_punto         ON ubicacion USING GIST (punto);   -- espacial
CREATE INDEX idx_jornada_tecnico         ON jornada (tecnico_id, inicio);
CREATE INDEX idx_jornada_activa          ON jornada (tecnico_id) WHERE estado = 'activa';
CREATE INDEX idx_parada_jornada          ON parada (jornada_id);
CREATE INDEX idx_alerta_estado           ON alerta (estado, creada_en);
CREATE INDEX idx_alerta_tecnico          ON alerta (tecnico_id);
CREATE INDEX idx_verificacion_tecnico    ON verificacion (tecnico_id, solicitada_en);
CREATE INDEX idx_verificacion_jornada    ON verificacion (jornada_id);

-- =====================================================================
--  DATOS INICIALES
-- =====================================================================
INSERT INTO franja_pausa (nombre, hora_inicio, hora_fin, activa)
VALUES ('Almuerzo', '12:00', '13:00', TRUE);

INSERT INTO configuracion DEFAULT VALUES;

-- Fin del script.
