class GlTexture
{
	textureId;
	modeFilter;
	modeWrap;
	width;
	height;
	gl;

	constructor()
	{
		this.gl = getGL();
		this.textureId = this.gl.createTexture();
		if ( !this.textureId )
			throw new Error("Failed to create texture");
	}

	initRGBA2D(modeFilter, modeWrap, source)
	{
		const gl = this.gl;

		if ( !source || !source.width || !source.height )
			throw new Error("initRGBA2D: invalid image source");

		this.width = source.width;
		this.height = source.height;
		gl.bindTexture(gl.TEXTURE_2D, this.textureId);
		// В WebGL2 несуществует автономного формата gl.RGBA для internalformat —
		// нужно явно указывать sized-формат gl.RGBA8, иначе загрузка текстуры падает с INVALID_OPERATION.
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
		const err = gl.getError();
		if ( err !== gl.NO_ERROR )
			console.error("initRGBA2D: texImage2D failed, gl error =", err);
		// Mipmaps генерируем только если фильтр их требует и источник — NPOT-безопасный случай.
		if ( modeFilter != gl.NEAREST && modeFilter != gl.LINEAR )
			gl.generateMipmap(gl.TEXTURE_2D);
		this.modeFilter = modeFilter;
		this.modeWrap = modeWrap;
	}

	initCustom2D(modeFilter, modeWrap, internalFormat, width, height, format, type, source)
	{
		const gl = this.gl;

		this.width = width;
		this.height = height;
		gl.bindTexture(gl.TEXTURE_2D, this.textureId);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); // данные тайлов могут иметь произвольную ширину
		gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, source);
		const err = gl.getError();
		if ( err !== gl.NO_ERROR )
			console.error("initCustom2D: texImage2D failed, gl error =", err);
		if ( modeFilter != gl.NEAREST && modeFilter != gl.LINEAR )
			gl.generateMipmap(gl.TEXTURE_2D);
		this.modeFilter = modeFilter;
		this.modeWrap = modeWrap;
	}

	use(target, unit, location)
	{
		const gl = this.gl;

		gl.activeTexture(gl.TEXTURE0 + unit);
		gl.bindTexture(target, this.textureId);
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.modeFilter );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this.modeFilter );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this.modeWrap );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, this.modeWrap );
		if ( location !== undefined && location !== null )
			gl.uniform1i(location, unit);
	};

	dispose()
	{
		if ( this.textureId )
		{
			this.gl.deleteTexture(this.textureId);
			this.textureId = null;
		}
	}
};