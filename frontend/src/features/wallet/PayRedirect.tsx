import { Navigate, useParams } from 'react-router-dom'

/** Old /pay/:reference links now open the same payment inside the Wallet card, maximised */
export default function PayRedirect() {
  const { reference = '' } = useParams()
  return <Navigate to={`/wallet?pay=${encodeURIComponent(reference)}&focus=1`} replace />
}
