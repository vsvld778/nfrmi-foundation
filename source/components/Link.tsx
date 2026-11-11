import type {ComponentProps} from 'react';
/** Native document navigation keeps all public routes usable without client routing. */
export default function Link(props:ComponentProps<'a'>){return <a {...props}/>;}
