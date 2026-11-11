import {PageIntro,BodyText} from '@/components/PublicUI';
import {getSettings} from '@/lib/server';
export const metadata={title:'Обработка данных'};
export default async function Privacy(){const s=await getSettings();return <><PageIntro label="Обработка данных" title="Условия работы с обращениями"/><section className="container section-bottom narrow"><BodyText text={s.privacyText}/></section></>}
