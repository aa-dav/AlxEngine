class GlProgram
{
	vertexShader;
	fragmentShader;
	program;
	gl;
	
	constructor(vertexSource, fragmentSource)
	{
		const gl = getGL();
		this.gl = gl;

		// Create WebGL Shader objects 
		this.vertexShader = gl.createShader(gl.VERTEX_SHADER); 
		this.fragmentShader = gl.createShader(gl.FRAGMENT_SHADER); 
  
		// sets the source code of the WebGL shader 
		gl.shaderSource(this.vertexShader, vertexSource); 
		gl.shaderSource(this.fragmentShader, fragmentSource); 
  
		// Compile GLSL Shaders to a binary data so 
		// WebGLProgram can use them 
		gl.compileShader(this.vertexShader);
		if ( !gl.getShaderParameter(this.vertexShader, gl.COMPILE_STATUS) )
		{
			const info = gl.getShaderInfoLog(this.vertexShader);
			gl.deleteShader(this.vertexShader);
			gl.deleteShader(this.fragmentShader);
			throw new Error("Vertex shader compile error: " + info);
		}

		gl.compileShader(this.fragmentShader);
		if ( !gl.getShaderParameter(this.fragmentShader, gl.COMPILE_STATUS) )
		{
			const info = gl.getShaderInfoLog(this.fragmentShader);
			gl.deleteShader(this.vertexShader);
			gl.deleteShader(this.fragmentShader);
			throw new Error("Fragment shader compile error: " + info);
		}
  
		// Create a WebGLProgram 
		this.program = gl.createProgram(); 
  
		// Attach pre-existing shaders 
		gl.attachShader(this.program, this.vertexShader); 
		gl.attachShader(this.program, this.fragmentShader); 
  
		gl.linkProgram(this.program);
		if ( !gl.getProgramParameter(this.program, gl.LINK_STATUS) )
		{
			const info = gl.getProgramInfoLog(this.program);
			gl.deleteProgram(this.program);
			gl.deleteShader(this.vertexShader);
			gl.deleteShader(this.fragmentShader);
			this.program = this.vertexShader = this.fragmentShader = null;
			throw new Error("Program link error: " + info);
		}

		// Шейдеру передаются только имена атрибутов/униформ, известных рендереру
		// (белый список вместо динамического свойства this["loc_" + name] —
		// это защищает от опечаток и от случайной записи произвольных ключей).
		this.loc = {};
		const knownAttributes  = ["a_data"];
		const knownUniforms    = [
			"u_bounds", "u_start_pos", "u_step_x", "u_step_y",
			"u_width_in_tiles", "u_tex_size_in_tiles", "u_top_tile",
			"u_texture", "u_textureMap"
		];

		let attrCount = gl.getProgramParameter(this.program, gl.ACTIVE_ATTRIBUTES);
		for ( let i = 0; i < attrCount; i++ )
		{
			let attrib = gl.getActiveAttrib(this.program, i);
			if ( knownAttributes.includes(attrib.name) )
				this.loc[attrib.name] = gl.getAttribLocation(this.program, attrib.name);
			else
				console.warn("Unexpected shader attribute:", attrib.name);
		}

		let unifCount = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
		for ( let i = 0; i < unifCount; i++ )
		{
			let uniform = gl.getActiveUniform(this.program, i);
			// Для массивов униформ ActiveUniform возвращает имя вида "name[0]"
			let baseName = uniform.name.replace(/\[.+\]$/, "");
			if ( knownUniforms.includes(baseName) )
				this.loc[baseName] = gl.getUniformLocation(this.program, uniform.name);
			else
				console.warn("Unexpected shader uniform:", uniform.name);
		}

		// Проверка, что все объявленные в GLSL известные униформы реально активны
		for ( const name of knownUniforms )
		{
			if ( !(name in this.loc) && this.uniformsInSource(name, vertexSource, fragmentSource) )
				console.warn("Uniform is declared in GLSL but optimized out or missing:", name);
		}
	}

	uniformsInSource(name, ...sources)
	{
		return sources.some(src => new RegExp("\\b" + name + "\\b").test(src));
	}

	use()
	{
		this.gl.useProgram(this.program);
	};

	dispose()
	{
		const gl = this.gl;
		if ( this.program )
		{
			gl.deleteProgram(this.program);
			this.program = null;
		}
		if ( this.vertexShader )
		{
			gl.deleteShader(this.vertexShader);
			this.vertexShader = null;
		}
		if ( this.fragmentShader )
		{
			gl.deleteShader(this.fragmentShader);
			this.fragmentShader = null;
		}
	};
};
