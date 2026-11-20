// Программа тейлового рендерера создаётся один раз лениво,
// но только после инициализации GL-контекста (см. getGL()).
let programTileRenderer = null;

function getTileRendererProgram()
{
	if ( !programTileRenderer )
		programTileRenderer = new GlProgram(tileRendererVertexSource, tileRendererFragmentSource);
	return programTileRenderer;
}

let tileRendererVertexSource = `#version 300 es
	precision highp float;
	precision highp int;
	uniform vec2 u_bounds;
	uniform vec2 u_start_pos;
	uniform vec2 u_step_x;
	uniform vec2 u_step_y;
	uniform int u_width_in_tiles;
	uniform ivec2 u_tex_size_in_tiles;
	uniform ivec2 u_top_tile;
	in vec2 a_data;
	out vec2 v_tex;
	flat out int v_raw_gid;
	uniform usampler2D u_textureMap;
	int posMod(int x, int y)
	{
		int ret = x % y;
		if (ret < 0)
			ret += y;
		return ret;
	}
	void main()
	{
		ivec2 tile_base = ivec2( gl_InstanceID % u_width_in_tiles, gl_InstanceID / u_width_in_tiles );
		vec2 coords = u_start_pos + (float( tile_base.x ) + a_data.x) * u_step_x + (float( tile_base.y ) + a_data.y) * u_step_y;
		ivec2 tex_size = textureSize( u_textureMap, 0 );
		ivec2 tex_fetch = ivec2( posMod((tile_base.x + u_top_tile.x), tex_size.x), posMod((tile_base.y + u_top_tile.y), tex_size.y) );
		// gid хранится как raw 32-битное значение Tiled: GID + флаги переворота/транспонирования
		uint raw_gid = texelFetch( u_textureMap, tex_fetch, 0 ).r;
		v_raw_gid = int(raw_gid);
		// Пустой тайл (gid == 0) в фрагментном шейдере не рисуется (discard),
		// сюда подставляем любой валидный индекс, чтобы избежать -1 -> unsigned wrap.
		int tile_num = raw_gid == 0u ? 0 : int( raw_gid & 0x1FFFFFFFu ) - 1;
		vec2 tex_base = vec2( float( tile_num % u_tex_size_in_tiles.x ), float( tile_num / u_tex_size_in_tiles.x ) );
		// Флаги Tiled: horizontal=0x80000000, vertical=0x40000000, anti-diagonal=0x10000000,
		// diagonal (транспонирование)=0x20000000.
		bool flipH = (raw_gid & 0x80000000u) != 0u;
		bool flipV = (raw_gid & 0x40000000u) != 0u;
		bool trans = (raw_gid & 0x20000000u) != 0u || (raw_gid & 0x10000000u) != 0u;
		vec2 uv = a_data;
		if ( trans )
			uv = uv.yx;
		if ( flipH )
			uv.x = 1.0 - uv.x;
		if ( flipV )
			uv.y = 1.0 - uv.y;
		v_tex = (tex_base + uv) / vec2( u_tex_size_in_tiles );
		gl_Position = vec4( mix( -1.0, +1.0, (coords.x) / u_bounds.x ),
						mix( +1.0, -1.0, (coords.y) / u_bounds.y ), 0.0, 1.0 );
	}`;

let tileRendererFragmentSource = `#version 300 es
	precision highp float;
	uniform sampler2D u_texture;
	in vec2 v_tex;
	flat in int v_raw_gid;
	out vec4 color;
	void main()
	{
		// Пустые клетки карты не рисуем вообще
		if ( v_raw_gid == 0 )
			discard;
		color = texture( u_texture, v_tex );
		// Чистый magenta из палитры Tiled считается прозрачностью.
		// Точное сравнение vec4 хрупко (BMP декодируется в RGBA), сравниваем каналы с допуском.
		if ( color.r > 0.95 && color.g < 0.05 && color.b > 0.95 )
			discard;
	}`;

// Разбор данных слоя: поддержка encoding="csv", "base64" (+ zlib/gzip через DecompressionStream) и XML-tiles.
async function parseLayerData(dataElement, expectedCount)
{
	const encoding = (dataElement.getAttribute("encoding") || "xml").toLowerCase();
	let gids = [];

	if ( encoding == "csv" )
	{
		gids = dataElement.textContent.trim().split(/[\s,]+/).filter(s => s.length !== 0).map(Number);
	}
	else if ( encoding == "base64" )
	{
		const compression = (dataElement.getAttribute("compression") || "").toLowerCase();
		const bin = atob(dataElement.textContent.replace(/\s+/g, ""));
		let bytes = new Uint8Array(bin.length);
		for ( let i = 0; i < bin.length; i++ )
			bytes[i] = bin.charCodeAt(i);
		if ( compression == "zlib" || compression == "gzip" )
		{
			if ( typeof DecompressionStream === "undefined" )
				throw new Error("Base64+" + compression + " compressed TMX data requires DecompressionStream support");
			const ds = new DecompressionStream(compression == "gzip" ? "gzip" : "deflate");
			const blob = new Blob([bytes]).stream().pipeThrough(ds);
			bytes = new Uint8Array(await new Response(blob).arrayBuffer());
		}
		else if ( compression !== "" && compression !== "none" )
		{
			throw new Error("Unsupported TMX compression: " + compression);
		}
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		const count = Math.floor(bytes.byteLength / 4);
		for ( let i = 0; i < count; i++ )
			gids.push(view.getUint32(i * 4, true)); // little-endian по спецификации Tiled
	}
	else // xml: дочерние элементы <tile gid="..."/>
	{
		for ( const t of dataElement.querySelectorAll("tile") )
			gids.push(Number(t.getAttribute("gid")));
	}

	if ( !Number.isInteger(expectedCount) || expectedCount <= 0 )
		expectedCount = gids.length;
	if ( gids.length !== expectedCount )
		console.warn(`parseLayerData: got ${gids.length} tiles, expected ${expectedCount}`);

	// gid занимает до 29 бит (< 2^31) — нужен Uint32Array; Uint16Array молча обрезал данные.
	const array = new Uint32Array(expectedCount);
	array.set(gids.slice(0, expectedCount));
	return array;
}

class MapLayer
{
	width;
	height;
	mapArray;
	texMap;
	tileSize;
	tilesetPixelsWide;
	tilesetPixelsHigh;

	constructor(mapXML, layerName)
	{
		// Синхронный парсинг геометрии; асинхронная часть (base64/zlib) — в loadAsync().
		if ( !mapXML || !mapXML.querySelector )
			throw new Error("MapLayer: invalid map XML document");

		if ( !mapXML.querySelector("map") )
			throw new Error("MapLayer: no <map> element in TMX");

		// Имя слоя может содержать спецсимволы — безопаснее искать перебором, чем CSS-селектором.
		let mapLayer = null;
		for ( const l of mapXML.querySelectorAll("layer") )
		{
			if ( l.getAttribute("name") === layerName )
			{
				mapLayer = l;
				break;
			}
		}
		if ( !mapLayer )
			throw new Error(`MapLayer: layer "${layerName}" not found`);

		const dataElement = mapLayer.querySelector("data");
		if ( !dataElement )
			throw new Error(`MapLayer: layer "${layerName}" has no <data>`);

		this.width = parseInt(mapLayer.getAttribute("width"), 10);
		this.height = parseInt(mapLayer.getAttribute("height"), 10);
		if ( !Number.isInteger(this.width) || !Number.isInteger(this.height) || this.width <= 0 || this.height <= 0 )
			throw new Error(`MapLayer: bad layer dimensions ${this.width}x${this.height}`);

		const mapTileSet = mapXML.querySelector("tileset");
		if ( !mapTileSet )
			throw new Error("MapLayer: no <tileset> in TMX");
		this.tileSize = parseInt(mapTileSet.getAttribute("tilewidth"), 10);
		const tileHeight = parseInt(mapTileSet.getAttribute("tileheight"), 10);
		if ( !Number.isInteger(this.tileSize) || this.tileSize <= 0 || this.tileSize !== tileHeight )
			throw new Error(`MapLayer: unsupported tile size ${this.tileSize}x${tileHeight}`);

		// Размер атласа тайлов берём из атрибутов TMX, а не из декодированного растрового файла:
		// браузеры декодируют BMP в RGBA, и pixel-размеры могут отличаться от заявленных.
		const imageElement = mapTileSet.querySelector("image");
		if ( imageElement )
		{
			this.tilesetPixelsWide = parseInt(imageElement.getAttribute("width"), 10);
			this.tilesetPixelsHigh = parseInt(imageElement.getAttribute("height"), 10);
		}

		this._dataElement = dataElement;
		this._pendingParse = parseLayerData(dataElement, this.width * this.height);
	}

	// Завершает асинхронную загрузку данных слоя и создаёт GPU-текстуру карты.
	async finish()
	{
		this.mapArray = await this._pendingParse;
		this._dataElement = null;
		this._pendingParse = null;

		this.texMap = new GlTexture();
		const gl = getGL();
		// R32UI вместо R16UI: полные 32 бита gid вместе с флагами переворота.
		this.texMap.initCustom2D(gl.NEAREST, gl.CLAMP_TO_EDGE, gl.R32UI,
			this.width, this.height, gl.RED_INTEGER, gl.UNSIGNED_INT, this.mapArray);
		return this;
	}

	static async create(mapXML, layerName)
	{
		return await new MapLayer(mapXML, layerName).finish();
	}

	render(tileMap, x, y)
	{
		const gl = getGL();
		const program = getTileRendererProgram();

		// Дробная часть смещения камеры обязана быть неотрицательной;
		// оператор % в JS для отрицательных аргументов даёт отрицательный остаток.
		const fracX = ((x % this.tileSize) + this.tileSize) % this.tileSize;
		const fracY = ((y % this.tileSize) + this.tileSize) % this.tileSize;
		const topTileX = Math.floor(x / this.tileSize);
		const topTileY = Math.floor(y / this.tileSize);

		const virtWidth = virtualWidth();
		const virtHeight = virtualHeight();

		const viewPortWidthInTiles = Math.ceil(virtWidth / this.tileSize) + 1;
		const viewPortHeightInTiles = Math.ceil(virtHeight / this.tileSize) + 1;

		// Размер атласа в тайлах: предпочтительно из TMX, иначе — из фактических размеров текстуры.
		const tilesWide = Math.max(1, Math.floor((this.tilesetPixelsWide || tileMap.width) / this.tileSize));
		const tilesHigh = Math.max(1, Math.floor((this.tilesetPixelsHigh || tileMap.height) / this.tileSize));

		program.use();
		tileMap.use(gl.TEXTURE_2D, 0, program.loc.u_texture);
		this.texMap.use(gl.TEXTURE_2D, 1, program.loc.u_textureMap);

		gl.uniform2f(program.loc.u_bounds,			virtWidth, virtHeight);
		gl.uniform2f(program.loc.u_start_pos,		-fracX,	-fracY);
		gl.uniform2f(program.loc.u_step_x,			this.tileSize,	0);
		gl.uniform2f(program.loc.u_step_y,			0,		this.tileSize);
		gl.uniform1i(program.loc.u_width_in_tiles,	viewPortWidthInTiles);
		gl.uniform2i(program.loc.u_tex_size_in_tiles,	tilesWide, tilesHigh);
		gl.uniform2i(program.loc.u_top_tile,		topTileX, topTileY);

		screenQuad.use(program.loc.a_data);
		screenQuad.draw( viewPortWidthInTiles * viewPortHeightInTiles );
	}

	dispose()
	{
		if ( this.texMap )
		{
			this.texMap.dispose();
			this.texMap = null;
		}
		this.mapArray = null;
	}
}
