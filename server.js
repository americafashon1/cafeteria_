const express = require("express");
const bodyParser = require("body-parser");
const mysql = require("mysql2/promise");
const nodemailer = require("nodemailer");
const wppconnect = require("@wppconnect-team/wppconnect");

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

let db;
let client;

// Inicialización
async function initialize() {
  try {
    db = await mysql.createConnection({
      host: "localhost",
      user: "root",
      password: "",
      database: "cafeteria"
    });
    console.log("Conectado a la base de datos.");

    client = await wppconnect.create();
    console.log("Cliente de WhatsApp iniciado.");
    
  } catch (error) {
    console.error("Error al iniciar la aplicación:", error);
    process.exit(1);
  }
}
initialize();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'navarrocfabiola260101@gmail.com',
    pass: 'ntzzqaccyzwsjuty'
  }
});

// 📲 Función para formatear el número
function formatearNumero(telefono) {
  // Quitar espacios o caracteres raros
  telefono = telefono.replace(/\D/g, "");
  
  // Si es México (10 dígitos) → usar 521
  if (telefono.length === 10) {
    return `521${telefono}@c.us`;
  }
  // Si ya viene con lada
  return `${telefono}@c.us`;
}

async function enviarWhatsApp(telefono, mensaje) {
  const numero = formatearNumero(telefono);
  try {
    await client.sendText(numero, mensaje);
    console.log("Mensaje de WhatsApp enviado a:", numero);
  } catch (error) {
    console.error("Error al enviar WhatsApp:", error);
  }
}

async function enviarCorreo(correo, mensaje) {
  const mailOptions = {
    from: 'navarrocfabiola260101@gmail.com',
    to: correo,
    subject: '¡Tienes un café gratis!',
    text: mensaje
  };
  try {
    await transporter.sendMail(mailOptions);
   console.log("Correo electrónico enviado.");
 } catch (error) {
 console.error("Error al enviar correo:", error);
  }
}

// 📦 Ruta compra
app.post("/compra", async (req, res) => {
  const { nombre, telefono, correo, tipo_cafe, tamano, unidades, pago } = req.body;
 const precioTamano = tamano === "chico" ? 50 : tamano === "mediana" ? 80 : tamano === "grande" ? 100 : 0;
  const precio = precioTamano * parseInt(unidades);

  try {
    const [clientes] = await db.query(
      "SELECT id, puntos, telefono FROM clientes WHERE telefono = ? OR telefono = ?",
      [telefono, `521${telefono}`]
    );

    let cliente_id;
    let puntos_actuales = 0;

    if (clientes.length === 0) {
      const [result] = await db.query("INSERT INTO clientes (nombre, telefono, correo, puntos) VALUES (?,?,?,0)",
        [nombre, `521${telefono}`, correo]);
      cliente_id = result.insertId;
    } else {
      cliente_id = clientes[0].id;
      puntos_actuales = clientes[0].puntos;

      // Actualizar número a formato correcto
      if (clientes[0].telefono === telefono) {
        await db.query("UPDATE clientes SET telefono = ? WHERE id = ?", [`521${telefono}`, cliente_id]);
      }
    }

    const nuevos_puntos = puntos_actuales + 10;
    await db.query("INSERT INTO compras (cliente_id, tipo_cafe, tamano, unidades, precio) VALUES (?,?,?,?,?)",
      [cliente_id, tipo_cafe, tamano, unidades, precio]);

    let mensajeGratis = "";
    if (nuevos_puntos >= 50) {
      await db.query("UPDATE clientes SET puntos = 0 WHERE id = ?", [cliente_id]);
      await db.query("INSERT INTO premios (cliente_id, veces_obtenido) VALUES (?,1) ON DUPLICATE KEY UPDATE veces_obtenido = veces_obtenido + 1", [cliente_id]);
      mensajeGratis = `¡Felicidades ${nombre}! Has obtenido un café gratis por acumular 50 puntos.`;
      await enviarCorreo(correo, mensajeGratis);
      await enviarWhatsApp(telefono, mensajeGratis); 
    } else {
      await db.query("UPDATE clientes SET puntos = ? WHERE id = ?", [nuevos_puntos, cliente_id]);
    }

    res.json({
      nombre,
      tipo_cafe,
      tamano,
      unidades,
      precio,
      pago,
      puntos: nuevos_puntos % 50,
      mensajeGratis
    });

  } catch (error) {
    console.error("Error en la ruta /compra:", error);
    res.status(500).json({ error: "Ocurrió un error al procesar la compra." });
  }
});

app.use(express.static(__dirname));
app.listen(3000, () => console.log("Servidor iniciado en puerto 3000"));
