// Categorías, ubicación por defecto y vida útil estimada (días) una vez comprado.
// Las cifras son orientativas para producto fresco refrigerado; la app marca la fecha como "estimada".
window.FOOD = (function () {
  const CATEGORIES = {
    lacteos:   { label: 'Dairy',            loc: 'nevera',     days: 7 },
    quesos:    { label: 'Cheese',             loc: 'nevera',     days: 21 },
    huevos:    { label: 'Eggs',             loc: 'nevera',     days: 28 },
    carne:     { label: 'Meat',              loc: 'nevera',     days: 3 },
    picada:    { label: 'Minced meat',       loc: 'nevera',     days: 1 },
    embutido:  { label: 'Cured & deli meats', loc: 'nevera',     days: 10 },
    pescado:   { label: 'Fish & seafood',  loc: 'nevera',     days: 2 },
    fruta:     { label: 'Fruit',              loc: 'nevera',     days: 7 },
    verdura:   { label: 'Vegetables',            loc: 'nevera',     days: 6 },
    hojas:     { label: 'Salad & leafy greens',   loc: 'nevera',     days: 4 },
    tuberculo: { label: 'Potatoes, onions & garlic', loc: 'despensa', days: 30 },
    pan:       { label: 'Bread & pastries',     loc: 'despensa',   days: 3 },
    preparado: { label: 'Ready meals & leftovers',  loc: 'nevera',     days: 3 },
    salsas:    { label: 'Sauces & spreads',  loc: 'nevera',     days: 30 },
    congelado: { label: 'Frozen',         loc: 'congelador', days: 120 },
    despensa:  { label: 'Dry goods',      loc: 'despensa',   days: 365 },
    conservas: { label: 'Tins & jars',          loc: 'despensa',   days: 730 },
    bebidas:   { label: 'Drinks',            loc: 'despensa',   days: 180 },
    otros:     { label: 'Other',              loc: 'nevera',     days: 14 },
  };

  // Palabras clave → categoría. Se evalúan en orden: las más específicas primero.
  const KEYWORDS = [
    ['congelad', 'congelado'], ['helado', 'congelado'], ['pizza congel', 'congelado'],
    ['salsa', 'salsas'], ['tomate frito', 'conservas'], ['picada', 'picada'], ['hamburguesa', 'picada'],
    ['ensalada', 'hojas'], ['lechuga', 'hojas'], ['canónigo', 'hojas'], ['rúcula', 'hojas'], ['espinaca', 'hojas'], ['brotes', 'hojas'],
    ['queso', 'quesos'], ['mozzarella', 'quesos'], ['parmesano', 'quesos'], ['burrata', 'quesos'],
    ['yogur', 'lacteos'], ['leche', 'lacteos'], ['nata', 'lacteos'], ['kéfir', 'lacteos'], ['kefir', 'lacteos'], ['mantequilla', 'lacteos'], ['natillas', 'lacteos'], ['flan', 'lacteos'],
    ['huevo', 'huevos'],
    ['jamón', 'embutido'], ['jamon', 'embutido'], ['chorizo', 'embutido'], ['salchichón', 'embutido'], ['pavo loncha', 'embutido'], ['fiambre', 'embutido'], ['bacon', 'embutido'], ['panceta', 'embutido'], ['beicon', 'embutido'], ['lomo embuchado', 'embutido'], ['salchicha', 'embutido'],
    ['atún en', 'conservas'], ['atun en', 'conservas'], ['lata', 'conservas'], ['conserva', 'conservas'], ['tomate frito', 'conservas'], ['garbanzos cocidos', 'conservas'],
    ['pollo', 'carne'], ['pechuga', 'carne'], ['ternera', 'carne'], ['cerdo', 'carne'], ['lomo', 'carne'], ['cordero', 'carne'], ['filete', 'carne'], ['costilla', 'carne'], ['solomillo', 'carne'], ['muslo', 'carne'], ['conejo', 'carne'],
    ['merluza', 'pescado'], ['salmón', 'pescado'], ['salmon', 'pescado'], ['bacalao', 'pescado'], ['dorada', 'pescado'], ['lubina', 'pescado'], ['gamba', 'pescado'], ['langostino', 'pescado'], ['mejillón', 'pescado'], ['calamar', 'pescado'], ['sepia', 'pescado'], ['atún', 'pescado'], ['atun', 'pescado'], ['sardina', 'pescado'], ['boquerón', 'pescado'], ['pescado', 'pescado'],
    ['patata', 'tuberculo'], ['cebolla', 'tuberculo'], ['ajo', 'tuberculo'], ['boniato', 'tuberculo'],
    ['manzana', 'fruta'], ['plátano', 'fruta'], ['platano', 'fruta'], ['naranja', 'fruta'], ['mandarina', 'fruta'], ['pera', 'fruta'], ['fresa', 'fruta'], ['uva', 'fruta'], ['kiwi', 'fruta'], ['melón', 'fruta'], ['sandía', 'fruta'], ['melocotón', 'fruta'], ['limón', 'fruta'], ['limon', 'fruta'], ['aguacate', 'fruta'], ['piña', 'fruta'], ['mango', 'fruta'], ['arándano', 'fruta'], ['frambuesa', 'fruta'],
    ['tomate', 'verdura'], ['pimiento', 'verdura'], ['calabacín', 'verdura'], ['calabacin', 'verdura'], ['berenjena', 'verdura'], ['zanahoria', 'verdura'], ['pepino', 'verdura'], ['brócoli', 'verdura'], ['brocoli', 'verdura'], ['coliflor', 'verdura'], ['champiñ', 'verdura'], ['seta', 'verdura'], ['puerro', 'verdura'], ['judía verde', 'verdura'], ['calabaza', 'verdura'], ['apio', 'verdura'], ['perejil', 'verdura'], ['cilantro', 'verdura'], ['albahaca', 'verdura'], ['alcachofa', 'verdura'], ['espárrago', 'verdura'],
    ['pan', 'pan'], ['baguette', 'pan'], ['croissant', 'pan'], ['bollo', 'pan'], ['magdalena', 'pan'],
    ['hummus', 'salsas'], ['mayonesa', 'salsas'], ['ketchup', 'salsas'], ['mostaza', 'salsas'], ['pesto', 'salsas'], ['salsa', 'salsas'], ['mermelada', 'salsas'],
    ['gazpacho', 'preparado'], ['tortilla', 'preparado'], ['lasaña', 'preparado'], ['croqueta', 'preparado'], ['sobras', 'preparado'], ['pasta fresca', 'preparado'],
    ['arroz', 'despensa'], ['pasta', 'despensa'], ['macarron', 'despensa'], ['espagueti', 'despensa'], ['harina', 'despensa'], ['azúcar', 'despensa'], ['azucar', 'despensa'], ['sal', 'despensa'], ['aceite', 'despensa'], ['vinagre', 'despensa'], ['lenteja', 'despensa'], ['garbanzo', 'despensa'], ['alubia', 'despensa'], ['galleta', 'despensa'], ['cereal', 'despensa'], ['café', 'despensa'], ['cafe', 'despensa'], ['cacao', 'despensa'], ['avena', 'despensa'], ['especia', 'despensa'], ['pimentón', 'despensa'], ['chocolate', 'despensa'], ['frutos secos', 'despensa'], ['nuez', 'despensa'], ['almendra', 'despensa'],
    ['agua', 'bebidas'], ['zumo', 'bebidas'], ['cerveza', 'bebidas'], ['vino', 'bebidas'], ['refresco', 'bebidas'], ['cola', 'bebidas'],
  ];


  // English keywords (specific ones first)
  const KEYWORDS_EN = [
    ['frozen', 'congelado'], ['ice cream', 'congelado'], ['eggplant', 'verdura'], ['peanut butter', 'salsas'], ['buttermilk', 'lacteos'],
    ['sauce', 'salsas'], ['mince', 'picada'], ['ground beef', 'picada'], ['burger', 'picada'],
    ['salad', 'hojas'], ['lettuce', 'hojas'], ['spinach', 'hojas'], ['rocket', 'hojas'], ['arugula', 'hojas'],
    ['cheese', 'quesos'], ['yogurt', 'lacteos'], ['yoghurt', 'lacteos'], ['milk', 'lacteos'], ['cream', 'lacteos'], ['butter', 'lacteos'],
    ['egg', 'huevos'], ['ham', 'embutido'], ['bacon', 'embutido'], ['salami', 'embutido'], ['sausage', 'embutido'], ['chorizo', 'embutido'],
    ['tinned', 'conservas'], ['canned', 'conservas'], ['can of', 'conservas'],
    ['chicken', 'carne'], ['beef', 'carne'], ['pork', 'carne'], ['lamb', 'carne'], ['steak', 'carne'], ['turkey', 'carne'],
    ['salmon', 'pescado'], ['cod', 'pescado'], ['hake', 'pescado'], ['tuna', 'pescado'], ['prawn', 'pescado'], ['shrimp', 'pescado'], ['mussel', 'pescado'], ['squid', 'pescado'], ['fish', 'pescado'],
    ['potato', 'tuberculo'], ['onion', 'tuberculo'], ['garlic', 'tuberculo'], ['sweet potato', 'tuberculo'],
    ['apple', 'fruta'], ['banana', 'fruta'], ['orange', 'fruta'], ['pear', 'fruta'], ['strawberr', 'fruta'], ['grape', 'fruta'], ['lemon', 'fruta'], ['avocado', 'fruta'], ['melon', 'fruta'], ['berr', 'fruta'], ['peach', 'fruta'], ['mango', 'fruta'], ['pineapple', 'fruta'],
    ['tomato', 'verdura'], ['pepper', 'verdura'], ['courgette', 'verdura'], ['zucchini', 'verdura'], ['aubergine', 'verdura'], ['eggplant', 'verdura'], ['carrot', 'verdura'], ['cucumber', 'verdura'], ['broccoli', 'verdura'], ['cauliflower', 'verdura'], ['mushroom', 'verdura'], ['leek', 'verdura'], ['celery', 'verdura'], ['parsley', 'verdura'], ['basil', 'verdura'], ['green beans', 'verdura'],
    ['bread', 'pan'], ['baguette', 'pan'], ['croissant', 'pan'], ['bun', 'pan'],
    ['hummus', 'salsas'], ['mayo', 'salsas'], ['ketchup', 'salsas'], ['mustard', 'salsas'], ['jam', 'salsas'], ['pesto', 'salsas'],
    ['leftover', 'preparado'], ['lasagne', 'preparado'], ['lasagna', 'preparado'], ['ready meal', 'preparado'], ['fresh pasta', 'preparado'],
    ['rice', 'despensa'], ['pasta', 'despensa'], ['spaghetti', 'despensa'], ['flour', 'despensa'], ['sugar', 'despensa'], ['salt', 'despensa'], ['oil', 'despensa'], ['vinegar', 'despensa'], ['lentil', 'despensa'], ['chickpea', 'despensa'], ['beans', 'despensa'], ['biscuit', 'despensa'], ['cookie', 'despensa'], ['cereal', 'despensa'], ['coffee', 'despensa'], ['oats', 'despensa'], ['chocolate', 'despensa'], ['nuts', 'despensa'], ['almond', 'despensa'],
    ['water', 'bebidas'], ['juice', 'bebidas'], ['beer', 'bebidas'], ['wine', 'bebidas'], ['soda', 'bebidas'], ['cola', 'bebidas'],
  ];

  // Unidad por defecto según categoría
  const DEFAULT_UNIT = { huevos: 'ud', fruta: 'ud', verdura: 'ud', pan: 'ud', carne: 'paquete', picada: 'paquete', pescado: 'paquete', lacteos: 'ud', bebidas: 'ud' };

  function norm(s) { return (s || '').toLowerCase().normalize('NFC').trim(); }
  function strip(s) { return norm(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  const RX = KEYWORDS_EN.concat(KEYWORDS).map(([kw, cat]) => [new RegExp('(^|[^a-z0-9])' + strip(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), cat]);

  // Primera palabra clave que aparece al inicio de una palabra del nombre (el orden de KEYWORDS decide)
  function guessCategory(name) {
    const ns = strip(name);
    for (const [re, cat] of RX) if (re.test(ns)) return cat;
    return 'otros';
  }

  return { CATEGORIES, guessCategory, DEFAULT_UNIT };
})();
