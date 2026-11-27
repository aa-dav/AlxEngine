// Единое хранилище WebGL2-контекста.
// Раньше все модули неявно зависели от глобальной переменной `gl`,
// что делало код хрупким (порядок инициализации не проверялся).
const GlContext = { gl: null };

function getGL()
{
	if ( !GlContext.gl )
		throw new Error("WebGL context is not initialized yet");
	return GlContext.gl;
}
