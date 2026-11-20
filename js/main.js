let canvas;
let loadedResources = 0;
let resourcesFailed = 0;
let images = {};
let maps = {};

const resources = [
	{ type: "img", name: "tileset01", src: "data/tileset-01.bmp" },
	{ type: "map", name: "map01", src: "data/map-01.tmx?1" },
	{ type: "map", name: "map01bg", src: "data/map-01-bg.tmx?0" }
];

// Вторая карта (dwd-01) и её тайлсет объявлялись, загружались, но нигде не использовались —
// мёртвые ресурсы убраны из списка загрузки. Если карта понадобится — добавьте её сюда
// и создайте отдельные MapLayer/GlTexture с собственным tileset.

let texTileMap;
let screenQuad;
let time = 0;
let mainLayer;
let backLayer;
let vpx = 0;
let vpy = 0;
let scaleFactor = 1;
let keysState = { up: 0, down: 0, right: 0, left: 0 };

// Параллакс-коэффициент фоновой карты (фон медленнее основного слоя).
const BACK_LAYER_PARALLAX = 6;

function virtualWidth()
{
	return canvas.width / scaleFactor;
}

function virtualHeight()
{
	return canvas.height / scaleFactor;
}

// Максимальное смещение камеры, чтобы экран не выходил за границы карты
// (иначе текстура карты зацикливается через posMod в шейдере).
function clampCamera()
{
	const maxVpx = Math.max(0, mainLayer.width * mainLayer.tileSize - virtualWidth());
	const maxVpy = Math.max(0, mainLayer.height * mainLayer.tileSize - virtualHeight());
	if ( vpx < 0 ) vpx = 0;
	if ( vpy < 0 ) vpy = 0;
	if ( vpx > maxVpx ) vpx = maxVpx;
	if ( vpy > maxVpy ) vpy = maxVpy;
}

function onResourceLoad()
{
	loadedResources++;
	if ( loadedResources + resourcesFailed == resources.length && resourcesFailed == 0 )
		appInit().catch(err => console.error("appInit failed:", err));
}

function onResourceError(resource)
{
	resourcesFailed++;
	console.error("Failed to load resource:", resource.name, resource.src);
}

async function fetchMap(resource)
{
	try
	{
		const response = await fetch(resource.src);
		if ( !response.ok )
			throw new Error(`HTTP ${response.status} ${response.statusText}`);
		const text = await response.text();
		const doc = new DOMParser().parseFromString(text, "application/xml");
		if ( doc.querySelector("parsererror") )
			throw new Error("XML parse error for " + resource.src);
		maps[resource.name] = { responseXML: doc };
		onResourceLoad();
	}
	catch ( err )
	{
		onResourceError(resource);
		console.error("Map load error:", resource.src, err);
	}
}

function loadImage(resource)
{
	return new Promise((resolve, reject) => {
		const item = new Image();
		item.onload = () => resolve(item);
		item.onerror = () => reject(new Error("Image load failed: " + resource.src));
		item.src = resource.src;
	});
}

async function appLoadResources(event)
{
	for ( const resource of resources )
	{
		if ( resource.type == "img" )
		{
			try
			{
				images[resource.name] = await loadImage(resource);
				onResourceLoad();
			}
			catch ( err )
			{
				onResourceError(resource);
				console.error(err);
			}
		}
		else if ( resource.type == "map" )
		{
			await fetchMap(resource);
		}
	}
}

function updateCamera(dtSeconds)
{
	// Скорость от времени, а не от числа кадров: раньше шаг был привязан к requestAnimationFrame.
	const step = 400 * dtSeconds;
	vpx += step * (keysState.right - keysState.left);
	vpy += step * (keysState.down - keysState.up);
	clampCamera();
}

let lastFrameTime = 0;

function tick( timeStamp )
{
	if ( GlContext.gl == null || mainLayer == null || backLayer == null )
		return;

	if ( lastFrameTime == 0 )
		lastFrameTime = timeStamp;
	let dt = Math.min((timeStamp - lastFrameTime) / 1000, 0.1); // защита от больших скачков после сна вкладки
	lastFrameTime = timeStamp;

	time += 1;

	updateCamera(dt);

	// Диапазоны прокрутки (max(1, ...) защищает от деления на ноль, если карта меньше экрана).
	const bgSpanX = Math.max(1, backLayer.width * backLayer.tileSize - virtualWidth());
	const bgSpanY = Math.max(1, backLayer.height * backLayer.tileSize - virtualHeight());
	const fgSpanX = Math.max(1, mainLayer.width * mainLayer.tileSize - virtualWidth());
	const fgSpanY = Math.max(1, mainLayer.height * mainLayer.tileSize - virtualHeight());

	// Параллакс фона: фон проходит свой полный диапазон, когда камера проходит полный
	// диапазон переднего плана. Деление экранировано Math.max(1, ...), NaN/Infinity невозможны.
	const bgx = Math.floor((vpx / fgSpanX) * bgSpanX / BACK_LAYER_PARALLAX);
	const bgy = Math.floor((vpy / fgSpanY) * bgSpanY / BACK_LAYER_PARALLAX);

	backLayer.render(texTileMap, bgx, bgy);
	mainLayer.render(texTileMap, vpx, vpy);

	window.requestAnimationFrame( tick );
};

function keyDown(evt)
{
	// Непрерывные клавиши движения
	if ( evt.key == 'ArrowLeft' )
		keysState.left = 1;
	else if ( evt.key == 'ArrowRight' )
		keysState.right = 1;
	else if ( evt.key == 'ArrowUp' )
		keysState.up = 1;
	else if ( evt.key == 'ArrowDown' )
		keysState.down = 1;
	// Клавиши масштаба
	else if ( evt.key >= '1' && evt.key <= '4' )
		scaleFactor = parseInt(evt.key, 10);
	else
		return;
	evt.preventDefault();
}

function keyUp(evt)
{
	if ( evt.key == 'ArrowLeft' )
		keysState.left = 0;
	else if ( evt.key == 'ArrowRight' )
		keysState.right = 0;
	else if ( evt.key == 'ArrowUp' )
		keysState.up = 0;
	else if ( evt.key == 'ArrowDown' )
		keysState.down = 0;
}

function resizeCanvas()
{
	const body = document.getElementById("idBody");
	canvas.width = body.clientWidth - 4;
	canvas.height = body.clientHeight - 4;
	GlContext.gl.viewport(0, 0, canvas.width, canvas.height);
	clampCamera();
}

async function appInit()
{
	const body = document.getElementById("idBody");
	canvas = document.getElementById("canvas");
	canvas.width = body.clientWidth - 4;
	canvas.height = body.clientHeight - 4;

	const gl = canvas.getContext("webgl2");
	if ( !gl )
	{
		alert("Your browser does not support WebGL 2!");
		return;
	}
	GlContext.gl = gl;

	texTileMap = new GlTexture();
	texTileMap.initRGBA2D(gl.NEAREST, gl.CLAMP_TO_EDGE, images.tileset01);

	screenQuad = new ScreenQuad();

	mainLayer = await MapLayer.create(maps.map01.responseXML, "map");
	backLayer = await MapLayer.create(maps.map01bg.responseXML, "map");

	vpx = 0;
	vpy = Math.floor((mainLayer.height * mainLayer.tileSize - virtualHeight()) / 2);
	clampCamera();

	gl.disable(gl.CULL_FACE);
	gl.disable(gl.DEPTH_TEST);
	gl.viewport(0, 0, canvas.width, canvas.height);

	document.addEventListener('keydown', keyDown);
	document.addEventListener('keyup', keyUp);
	window.addEventListener('resize', resizeCanvas);

	window.requestAnimationFrame( tick );
};
