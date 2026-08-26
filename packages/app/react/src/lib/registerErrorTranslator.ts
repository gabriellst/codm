import { setErrorTranslator } from '@codm/app-ui/errorTranslator'
import { translateError } from './errors'

/**
 * PREENCHE a porta que `@codm/app-ui` declara — o lado do APP de uma dependência invertida.
 *
 * `field.tsx` precisa transformar a mensagem de erro de um formulário em texto legível, e quem sabe
 * fazer isso é este app: a tradução depende de `errorsEnum` (gerado do registro de erros dos
 * backends), dos stores de sessão/onboarding e da instância de i18n daqui.
 *
 * O pacote de UI não pode importar nada disso sem passar a depender da SDK do produto que ele serve.
 * Então ele declara a porta com um default VERBATIM (um pacote sem app continua funcionando, exibindo
 * a mensagem como veio) e este módulo a preenche.
 *
 * Import de EFEITO, sem export: quem o importa está declarando "este app registra o seu tradutor",
 * e o único importador é `routes/__root.tsx`, ao lado do `import '@/lib/i18n'` do qual esta função
 * depende.
 */
setErrorTranslator(translateError)
