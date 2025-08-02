import BLOG from '@/blog.config'
import { Feed } from 'feed'
import fs from 'fs'
import path from 'path'

/**
 * [终极修复版]
 * 精确清洗并生成RSS内容，专门针对您的网站HTML结构。
 * @param {object} post - 文章对象
 * @returns {Promise<string>} 清洗后的HTML内容
 */
const createFeedContent = async (post) => {
  // 安全检查：如果 post 或 post.summary 不存在，则返回空字符串。
  if (!post || !post.summary) {
    return ''
  }

  let content = post.summary

  // 核心修复：
  // 您的主题使用 <article> 和 <header> 标签来包裹头部信息。
  // 我们需要精确地移除整个 <header>...</header> 部分。
  // 这个 <header> 包含了页面大图标、标题下的作者/日期信息、以及所有的属性行。
  content = content.replace(/<header>[\s\S]*?<\/header>/, '')

  // 为了以防万一，我们保留之前对 <div> 格式的清洗规则，
  // 以便在未来主题或文章格式变化时提供一层保障。
  content = content.replace(/<div class="notion-page-icon-inline">.*?<\/div>/s, '')
  content = content.replace(/<div class="notion-collection-row">.*?<\/div>/g, '')

  // 清除所有内容后的前后空白，使输出更整洁
  content = content.trim()

  return content
}

/**
 * 生成RSS数据
 * @param {object} props
 */
export async function generateRss(props) {
  const { NOTION_CONFIG, siteInfo, latestPosts } = props
  const TITLE = siteInfo?.title
  const DESCRIPTION = siteInfo?.description
  const LINK = siteInfo?.link || BLOG.LINK
  const AUTHOR = NOTION_CONFIG?.AUTHOR || BLOG.AUTHOR
  const LANG = NOTION_CONFIG?.LANG || BLOG.LANG
  const SUB_PATH = NOTION_CONFIG?.SUB_PATH || BLOG.SUB_PATH
  const CONTACT_EMAIL = NOTION_CONFIG?.CONTACT_EMAIL || BLOG.CONTACT_EMAIL

  const rssPath = path.resolve('./public/rss/feed.xml')
  
  if (isFeedRecentlyUpdated(rssPath, 10)) {
    return
  }

  console.log('[RSS订阅] 生成 /rss/feed.xml')
  const year = new Date().getFullYear()
  const feed = new Feed({
    title: TITLE,
    description: DESCRIPTION,
    link: `${LINK}/${SUB_PATH}`,
    language: LANG,
    favicon: `${LINK}/favicon.png`,
    copyright: `All rights reserved ${year}, ${AUTHOR}`,
    author: { name: AUTHOR, email: CONTACT_EMAIL, link: LINK }
  })

  const latestPostsLimited = latestPosts.slice(0, 10)
  for (const post of latestPostsLimited) {
    const content = await createFeedContent(post)

    feed.addItem({
      title: post.title,
      link: `${BLOG.LINK}/${post.slug}`,
      description: content, 
      content: `<![CDATA[${content}]]>`,
      date: new Date(post?.publishDay)
    })
  }

  try {
    fs.mkdirSync('./public/rss', { recursive: true })
    fs.writeFileSync(rssPath, feed.rss2())
    fs.writeFileSync(path.resolve('./public/rss/atom.xml'), feed.atom1())
    fs.writeFileSync(path.resolve('./public/rss/feed.json'), feed.json1())
  } catch (error) {
    console.warn('[RSS 生成失败] 可能运行在只读文件系统，已跳过写入')
  }
}

/**
 * 检查上次更新的辅助函数
 * @param {string} filePath
 * @param {number} intervalMinutes
 * @returns {boolean}
 */
function isFeedRecentlyUpdated(filePath, intervalMinutes = 60) {
  try {
    const stats = fs.statSync(filePath)
    return (Date.now() - stats.mtimeMs) < intervalMinutes * 60 * 1000
  } catch (error) {
    return false
  }
}```

