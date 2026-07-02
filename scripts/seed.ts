import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const IMG1 = 'https://thumbs.dreamstime.com/b/modern-luxury-home-swimming-pool-contemporary-backyard-house-features-large-windows-stone-walls-clean-geometric-357048160.jpg?w=1600';
const IMG2 = 'https://thumbs.dreamstime.com/b/cozy-house-beautiful-landscaping-sunny-day-home-exterior-75443602.jpg';
const IMG3 = 'https://thumbs.dreamstime.com/b/modern-downtown-apartment-building-architecture-denver-colorado-59236016.jpg';
const IMG4 = 'https://onekindesign.com/wp-content/uploads/2023/09/Coastal-Dream-House-North-Carolina-Locati-Architects-01-1-Kindesign.jpg';
const IMG5 = 'https://media.architecturaldigest.com/photos/64f71af50a84399fbdce2f6a/16:9/w_2560%2Cc_limit/Living%2520with%2520Lolo%2520Photo%2520Credit_%2520Life%2520Created%25204.jpg';
const IMG6 = 'https://images.squarespace-cdn.com/content/v1/5f5e712b221bd53db2a680ec/b13778a1-9739-4474-adee-9fff2cffcfed/Colonial+Architecture+Intro+-+Classic+Wood+Georgian+Colonial+-+Charles+Hilton+Architects.jpg';
const IMG7 = 'https://onekindesign.com/wp-content/uploads/2022/03/Luxury-Modern-Bayfront-Home-Brandon-Architects-01-1-Kindesign.jpg';
const IMG8 = 'https://media.istockphoto.com/id/1399116537/photo/modern-townhomes.jpg?s=612x612&w=0&k=20&c=t-0ZR-ELlY-xHeNzdPUNNCoKPc_bCJWzY93YkXUNeVg=';
const IMG9 = 'https://images.mansionglobal.com/im-41777545?width=1920&size=1.7777777777777777';
const IMG10 = 'https://res.cloudinary.com/brickandbatten/images/w_2560,h_1920,c_scale/f_auto,q_auto/v1663190116/wordpress_assets/120535-Alabaster-SW-Bleek-Beige-BM-Pure-White-SW-FR/120535-Alabaster-SW-Bleek-Beige-BM-Pure-White-SW-FR.jpg?_i=AA';

async function main() {
  console.log('Seeding database...');

  const adminHash = await bcrypt.hash('johndoe123', 10);
  await prisma.user.upsert({
    where: { email: 'john@doe.com' },
    update: {},
    create: {
      email: 'john@doe.com',
      passwordHash: adminHash,
      name: 'Admin Test',
      phone: '+5491100000000',
      role: 'admin',
    },
  });

  const adminHash2 = await bcrypt.hash('Admin2024!', 10);
  await prisma.user.upsert({
    where: { email: 'admin@cvadeal.com' },
    update: {},
    create: {
      email: 'admin@cvadeal.com',
      passwordHash: adminHash2,
      name: 'Administrador CVA',
      phone: '+5491100000001',
      role: 'admin',
    },
  });

  // Asesor de prueba
  const advisorHash = await bcrypt.hash('Asesor2024!', 10);
  await prisma.user.upsert({
    where: { email: 'asesor@cvadeal.com' },
    update: {},
    create: {
      email: 'asesor@cvadeal.com',
      passwordHash: advisorHash,
      name: 'Carlos Asesor',
      phone: '+5491100000002',
      role: 'advisor',
    },
  });

  // ===== CONSTRUCTORAS =====
  const nexa = await prisma.constructor.upsert({
    where: { slug: 'nexa' },
    update: {},
    create: {
      name: 'Nexa Construcciones',
      slug: 'nexa',
      logoCloudPath: '/constructors/nexa-logo.jpg',
      coverCloudPath: '/constructors/nexa-cover.jpg',
      description: 'Constructora líder en desarrollos modernos y sustentables. Especialistas en viviendas de alta gama con tecnología de última generación.',
      styles: ['Moderna', 'Minimalista', 'Contemporánea'],
      customModels: true,
      yearsExperience: 12,
      guarantee: '10 años de garantía estructural',
      counseling: 'Asesoramiento personalizado gratuito',
      active: true,
    },
  });

  const grupoMac = await prisma.constructor.upsert({
    where: { slug: 'grupo-mac' },
    update: {},
    create: {
      name: 'Grupo Mac',
      slug: 'grupo-mac',
      logoCloudPath: '/constructors/grupo-mac-logo.jpg',
      coverCloudPath: '/constructors/grupo-mac-cover.jpg',
      description: 'Grupo consolidado con más de 20 años en el mercado inmobiliario argentino. Desarrollos residenciales y comerciales de primer nivel.',
      styles: ['Clásica', 'Colonial', 'Art Deco'],
      customModels: false,
      yearsExperience: 22,
      guarantee: '15 años de garantía estructural',
      counseling: 'Financiación directa hasta 120 cuotas',
      active: true,
    },
  });

  const papampa = await prisma.constructor.upsert({
    where: { slug: 'papampa' },
    update: {},
    create: {
      name: 'Papampa Desarrollos',
      slug: 'papampa',
      logoCloudPath: '/constructors/papampa-logo.jpg',
      coverCloudPath: '/constructors/papampa-cover.jpg',
      description: 'Desarrollos inmobiliarios en zonas premium del interior. Casas de campo y barrios cerrados con el mejor entorno natural.',
      styles: ['Rústica', 'Mediterránea', 'Contemporánea'],
      customModels: true,
      yearsExperience: 8,
      guarantee: '8 años de garantía estructural',
      counseling: 'Visitas guiadas sin costo',
      active: true,
    },
  });

  const props = [
    { id: 'prop-1', address: 'Av. Libertador 4500, Palermo', city: 'Buenos Aires', constructionCompany: 'Nexa Construcciones', constructorId: nexa.id, price: 85000000, surface: 180, age: 5, legalStatus: 'Libre de gravámenes', financingStatus: 'Acepta crédito hipotecario', constructionStyle: 'Moderna', consultingPrice: 35000, images: [IMG1], description: 'Espectacular casa moderna con piscina en Palermo. Diseño contemporáneo con amplios ventanales y acabados premium.', bedrooms: 4, bathrooms: 3, active: true, isNewLine: true, isFeatured: true },
    { id: 'prop-2', address: 'Calle Mendoza 1234, Belgrano', city: 'Buenos Aires', constructionCompany: 'Grupo Mac', constructorId: grupoMac.id, price: 48000000, surface: 120, age: 15, legalStatus: 'En regla', financingStatus: 'Financiación directa', constructionStyle: 'Clásica', consultingPrice: 25000, images: [IMG2], description: 'Acogedora casa familiar en zona residencial de Belgrano. Jardín amplio con paisajismo profesional.', bedrooms: 3, bathrooms: 2, active: true },
    { id: 'prop-3', address: 'Av. Corrientes 3200, Centro', city: 'Buenos Aires', constructionCompany: 'Nexa Construcciones', constructorId: nexa.id, price: 25000000, surface: 65, age: 8, legalStatus: 'Libre de gravámenes', financingStatus: 'Solo contado', constructionStyle: 'Contemporánea', consultingPrice: 18000, images: [IMG3], description: 'Departamento moderno en pleno centro porteño. Excelente ubicación con acceso a transporte público.', bedrooms: 2, bathrooms: 1, active: true },
    { id: 'prop-4', address: 'Camino Real 890, Pilar', city: 'Pilar', constructionCompany: 'Papampa Desarrollos', constructorId: papampa.id, price: 65000000, surface: 220, age: 3, legalStatus: 'Escritura en trámite', financingStatus: 'Acepta crédito hipotecario', constructionStyle: 'Mediterránea', consultingPrice: 30000, images: [IMG4], description: 'Hermosa casa de campo con jardín extenso en barrio cerrado de Pilar. Construcción moderna.', bedrooms: 5, bathrooms: 3, active: true, isFeatured: true },
    { id: 'prop-5', address: 'Av. del Libertador 7800, Núñez', city: 'Buenos Aires', constructionCompany: 'Nexa Construcciones', constructorId: nexa.id, price: 38000000, surface: 85, age: 2, legalStatus: 'En regla', financingStatus: 'Financiación directa', constructionStyle: 'Minimalista', consultingPrice: 22000, images: [IMG5], description: 'Departamento minimalista de diseño contemporáneo. Ambientes luminosos con vista panorámica.', bedrooms: 2, bathrooms: 2, active: true, isNewLine: true },
    { id: 'prop-6', address: 'San Martín 456, San Isidro', city: 'San Isidro', constructionCompany: 'Grupo Mac', constructorId: grupoMac.id, price: 72000000, surface: 200, age: 45, legalStatus: 'Libre de gravámenes', financingStatus: 'Acepta permuta', constructionStyle: 'Colonial', consultingPrice: 32000, images: [IMG6], description: 'Elegante residencia colonial en San Isidro. Techos altos y pisos de madera con renovaciones modernas.', bedrooms: 4, bathrooms: 3, active: true },
    { id: 'prop-7', address: 'Costanera Sur 200, Tigre', city: 'Tigre', constructionCompany: 'Papampa Desarrollos', constructorId: papampa.id, price: 95000000, surface: 250, age: 1, legalStatus: 'En regla', financingStatus: 'Acepta crédito hipotecario', constructionStyle: 'Moderna', consultingPrice: 45000, images: [IMG7], description: 'Propiedad premium frente al río en Tigre. Muelle privado, piscina climatizada y vistas al delta.', bedrooms: 5, bathrooms: 4, active: true, isNewLine: true, isFeatured: true },
    { id: 'prop-8', address: 'Juncal 2100, Recoleta', city: 'Buenos Aires', constructionCompany: 'Grupo Mac', constructorId: grupoMac.id, price: 42000000, surface: 95, age: 10, legalStatus: 'Libre de gravámenes', financingStatus: 'Solo contado', constructionStyle: 'Art Deco', consultingPrice: 24000, images: [IMG8], description: 'Townhouse moderno en Recoleta. Dos plantas con terraza privada y excelente ubicación.', bedrooms: 3, bathrooms: 2, active: true },
    { id: 'prop-9', address: 'Av. Santa Fe 4000, Piso 18', city: 'Buenos Aires', constructionCompany: 'Nexa Construcciones', constructorId: nexa.id, price: 110000000, surface: 160, age: 3, legalStatus: 'En regla', financingStatus: 'Financiación directa', constructionStyle: 'Contemporánea', consultingPrice: 42000, images: [IMG9], description: 'Penthouse de lujo con vista panorámica de la ciudad. Terraza de 40m², domótica integrada.', bedrooms: 3, bathrooms: 3, active: true, isFeatured: true },
    { id: 'prop-10', address: 'Los Olivos 567, Nordelta', city: 'Nordelta', constructionCompany: 'Papampa Desarrollos', constructorId: papampa.id, price: 78000000, surface: 210, age: 6, legalStatus: 'Libre de gravámenes', financingStatus: 'Acepta crédito hipotecario', constructionStyle: 'Rústica', consultingPrice: 28000, images: [IMG10], description: 'Villa mediterránea en Nordelta con amplio jardín y piscina. Barrio cerrado con seguridad 24hs.', bedrooms: 4, bathrooms: 3, active: true },
  ];

  for (const prop of props) {
    await prisma.property.upsert({
      where: { id: prop.id },
      update: { ...prop },
      create: { ...prop },
    });
  }

  // Seed default stats popups
  const statsPopupsData = [
    { section: 'home', statKey: 'clientes_asesorados', value: '+500', label: 'Clientes asesorados', title: 'Más de 500 familias nos eligieron', content: 'Desde nuestros inicios, hemos asesorado a más de 500 familias en todo el proceso de adquisición de su vivienda. Cada cliente recibe atención personalizada con un asesor dedicado que lo acompaña desde la primera consulta hasta la entrega de llaves.' },
    { section: 'home', statKey: 'viviendas_vendidas', value: '+200', label: 'Viviendas vendidas', title: 'Más de 200 viviendas entregadas', content: 'Hemos completado con éxito la entrega de más de 200 viviendas en la región patagónica. Cada proyecto es supervisado con los más altos estándares de calidad y cumplimiento de plazos.' },
    { section: 'home', statKey: 'calificacion_promedio', value: '4.9/5', label: 'Calificación promedio', title: 'Excelencia reconocida por nuestros clientes', content: 'Nuestra calificación promedio de 4.9 sobre 5 refleja el compromiso con la satisfacción del cliente. Cada opinión nos impulsa a mejorar continuamente nuestro servicio.' },
    { section: 'home', statKey: 'anos_experiencia', value: '+10', label: 'Años de experiencia', title: 'Más de una década de trayectoria', content: 'Con más de 10 años en el mercado inmobiliario de construcción en seco, contamos con la experiencia y el conocimiento necesarios para guiarte en la mejor decisión para tu hogar.' },
    { section: 'entregas', statKey: 'entregas_realizadas', value: '+50', label: 'Entregas realizadas', title: 'Más de 50 entregas exitosas', content: 'Cada entrega es una celebración. Hemos realizado más de 50 entregas exitosas, cumpliendo con los plazos y las expectativas de nuestros clientes.' },
    { section: 'entregas', statKey: 'clientes_satisfechos', value: '100%', label: 'Clientes satisfechos', title: 'Satisfacción total garantizada', content: 'El 100% de nuestros clientes reportan satisfacción con el resultado final de su vivienda. Nuestro compromiso es que cada familia reciba exactamente lo que soñó.' },
    { section: 'entregas', statKey: 'tiempo_promedio', value: '45 días', label: 'Tiempo promedio', title: '45 días de la reserva a las llaves', content: 'Nuestro proceso optimizado permite entregar tu vivienda en un promedio de 45 días hábiles desde la firma del contrato. La construcción en seco nos permite cumplir estos plazos.' },
    { section: 'entregas', statKey: 'cobertura_geografica', value: 'Neuquén, Río Negro', label: 'y toda la Patagonia', title: 'Cobertura en toda la Patagonia', content: 'Operamos en Neuquén, Río Negro y toda la región patagónica. Nuestro equipo se desplaza para brindarte la mejor asesoría sin importar dónde esté tu terreno.' },
  ];
  for (const sp of statsPopupsData) {
    await prisma.statsPopup.upsert({
      where: { section_statKey: { section: sp.section, statKey: sp.statKey } },
      update: {},
      create: sp,
    });
  }
  console.log('Stats popups seeded');

  // Seed default energy simulator configs
  const energyConfigs = [
    { sizeM2: 48, label: 'Vivienda 48 m²', tradCost: 19500, secoCost: 9700, sortOrder: 0 },
    { sizeM2: 70, label: 'Vivienda 70 m²', tradCost: 28450, secoCost: 14120, sortOrder: 1 },
    { sizeM2: 90, label: 'Vivienda 90 m²', tradCost: 36580, secoCost: 18150, sortOrder: 2 },
    { sizeM2: 110, label: 'Vivienda 110 m²', tradCost: 44700, secoCost: 22180, sortOrder: 3 },
    { sizeM2: 130, label: 'Vivienda 130 m²', tradCost: 52850, secoCost: 26240, sortOrder: 4 },
  ];
  for (const ec of energyConfigs) {
    await prisma.energySimConfig.upsert({
      where: { sizeM2: ec.sizeM2 },
      create: ec,
      update: { label: ec.label, tradCost: ec.tradCost, secoCost: ec.secoCost, sortOrder: ec.sortOrder },
    });
  }
  console.log('Energy configs seeded');

  console.log('Seeding complete!');
}

main()
  .catch((e: any) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
