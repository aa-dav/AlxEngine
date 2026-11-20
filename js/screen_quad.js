class ScreenQuad
{
	vboPositions;
	gl;

	constructor()
	{
		const gl = getGL();
		this.gl = gl;

		// Единичный квад (0,0)-(1,1); вершины используются как локальные координаты тайла
		let positions = new Float32Array([0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0]);

		this.vboPositions = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vboPositions);
		gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
	}

	use(posLocation)
	{
		const gl = this.gl;

		if ( posLocation === undefined || posLocation === null || posLocation < 0 )
		{
			console.error("ScreenQuad.use: invalid attribute location", posLocation);
			return;
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vboPositions);
		gl.enableVertexAttribArray(posLocation);
		gl.vertexAttribPointer(posLocation, 2, gl.FLOAT, gl.FALSE, 0, 0);
	};

	draw(instanceCount)
	{
		this.gl.drawArraysInstanced(this.gl.TRIANGLE_STRIP, 0, 4, instanceCount);
	}

	dispose()
	{
		if ( this.vboPositions )
		{
			this.gl.deleteBuffer(this.vboPositions);
			this.vboPositions = null;
		}
	}
};
